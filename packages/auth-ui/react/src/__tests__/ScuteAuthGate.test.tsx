import { useState, type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@scute/react-hooks";
import { ScuteAuthGate, type ScuteAuthGateProps } from "../ScuteAuthGate";
import {
  ACCESS_TOKEN,
  AUTH_CHANGE_EVENTS,
  MAGIC_TOKEN,
  REFRESH_TOKEN,
  USER,
  authenticatedSession,
  createFakeClient,
  deferred,
  makeWrapper,
  setUrl,
  type FakeClient,
} from "./fakeScuteClient";

const PROTECTED = "Protected app content";

function renderGate(
  client: FakeClient = createFakeClient(),
  props: Partial<ScuteAuthGateProps> = {}
) {
  const Wrapper = makeWrapper(client);
  const ui = (p: Partial<ScuteAuthGateProps>) => (
    <Wrapper>
      <ScuteAuthGate {...p}>
        <p>{PROTECTED}</p>
      </ScuteAuthGate>
    </Wrapper>
  );
  const utils = render(ui(props));
  return {
    client,
    ...utils,
    rerenderGate: (p: Partial<ScuteAuthGateProps> = props) => utils.rerender(ui(p)),
  };
}

async function renderAtLogin(client: FakeClient = createFakeClient(), props: Partial<ScuteAuthGateProps> = {}) {
  const r = renderGate(client, props);
  await screen.findByRole("heading", { name: "Sign in" });
  return r;
}

function submitEmail(email: string) {
  const input = screen.getByPlaceholderText("you@example.com");
  fireEvent.change(input, { target: { value: email } });
  fireEvent.submit(input.closest("form")!);
}

const view = (container: HTMLElement) =>
  container.querySelector("[data-scute-view]")?.getAttribute("data-scute-view") ?? null;

beforeEach(() => {
  setUrl("/");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setUrl("/");
});

describe("default views", () => {
  it("shows a loading screen until the SDK is initialized", async () => {
    const init = deferred<any>();
    const { container } = renderGate(createFakeClient({ _initialize: vi.fn(() => init.promise) }));
    expect(screen.getByText("Loading...")).toBeTruthy();
    expect(view(container)).toBe("loading");
    expect(screen.queryByText(PROTECTED)).toBeNull();
    await act(async () => init.resolve({ error: null }));
    await screen.findByRole("heading", { name: "Sign in" });
  });

  it("shows the email login form after init", async () => {
    const { container } = await renderAtLogin();
    expect(view(container)).toBe("login");
    expect(screen.getByText("Enter your email to continue")).toBeTruthy();
    const input = screen.getByPlaceholderText("you@example.com") as HTMLInputElement;
    expect(input.type).toBe("email");
    expect(input.name).toBe("email");
    expect(input.required).toBe(true);
    const button = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("submits the typed email and disables the button while submitting", async () => {
    const client = createFakeClient();
    const pending = deferred<any>();
    client.signInOrUp.mockReturnValue(pending.promise);
    await renderAtLogin(client);
    act(() => submitEmail("ada@example.com"));
    expect(client.signInOrUp).toHaveBeenCalledWith("ada@example.com");
    const button = screen.getByRole("button", { name: "Loading..." }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await act(async () => pending.resolve({ data: null, error: null }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("renders the sign-in error under the form", async () => {
    const client = createFakeClient({
      signInOrUp: vi.fn(async () => ({ data: null, error: { message: "Identifier not recognized" } })),
    });
    const { container } = await renderAtLogin(client);
    await act(async () => submitEmail("nobody@example.com"));
    const err = container.querySelector("[data-scute-error]");
    expect(err?.textContent).toBe("Identifier not recognized");
  });

  it("shows the check-your-email screen with the identifier, and Change email goes back", async () => {
    const client = createFakeClient();
    client.signInOrUp.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.MAGIC_PENDING);
      return { data: { magic_link: { id: "ml_1" } }, error: null };
    });
    const { container } = await renderAtLogin(client);
    await act(async () => submitEmail("ada@example.com"));
    expect(screen.getByRole("heading", { name: "Check your email" })).toBeTruthy();
    expect(container.querySelector("strong")?.textContent).toBe("ada@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Change email" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("shows Verifying... while a magic link from the URL is being verified", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const verify = deferred<any>();
    const { container } = renderGate(createFakeClient({ verifyMagicLinkToken: vi.fn(() => verify.promise) }));
    await screen.findByText("Verifying...");
    expect(view(container)).toBe("loading");
    await act(async () => verify.resolve({ data: null, error: { message: "Link expired" } }));
    await screen.findByText("Link expired");
  });

  it("shows the OTP screen and auto-submits once six digits are typed", async () => {
    const client = createFakeClient({
      verifyOtp: vi.fn(async () => ({ data: null, error: { message: "Invalid OTP" } })),
    });
    client.signInOrUp.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.OTP_PENDING);
      return { data: { otp: { id: "otp_1" } }, error: null };
    });
    const { container } = await renderAtLogin(client);
    await act(async () => submitEmail("ada@example.com"));
    expect(screen.getByRole("heading", { name: "Enter code" })).toBeTruthy();
    expect(container.querySelector("strong")?.textContent).toBe("ada@example.com");

    const input = screen.getByPlaceholderText("000000");
    await act(async () => {
      fireEvent.change(input, { target: { value: "12345" } });
    });
    expect(client.verifyOtp).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.change(input, { target: { value: "12-34 56" } });
    });
    expect(client.verifyOtp).toHaveBeenCalledTimes(1);
    expect(client.verifyOtp).toHaveBeenCalledWith("123456", "ada@example.com");
    expect(container.querySelector("[data-scute-error]")?.textContent).toBe("Invalid OTP");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("shows the passkey prompt on WEBAUTHN_VERIFY_START", async () => {
    const { client, container } = await renderAtLogin();
    act(() => client.emit(AUTH_CHANGE_EVENTS.WEBAUTHN_VERIFY_START));
    expect(screen.getByRole("heading", { name: "Verify your passkey" })).toBeTruthy();
    expect(view(container)).toBe("webauthn_verify");
  });

  it("offers passkey registration after a magic link and shows the app after registering", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const { client } = renderGate();
    await screen.findByRole("heading", { name: "Register a passkey" });
    fireEvent.click(screen.getByRole("button", { name: "Register passkey" }));
    await screen.findByRole("heading", { name: "Passkey registered" });
    expect(client.addDevice).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(PROTECTED)).toBeNull();
    await waitFor(() => expect(screen.getByText(PROTECTED)).toBeTruthy(), { timeout: 3000 });
  });

  it("shows the app after Skip for now", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const { client } = renderGate();
    await screen.findByRole("heading", { name: "Register a passkey" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    });
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1);
    expect(client.addDevice).not.toHaveBeenCalled();
    expect(screen.getByText(PROTECTED)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Register a passkey" })).toBeNull();
  });

  it("shows the addDevice error on the offer, then the app after Skip for now", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      addDevice: vi.fn(async () => ({ data: null, error: { message: "The operation was cancelled" } })),
    });
    const { container } = renderGate(client);
    await screen.findByRole("heading", { name: "Register a passkey" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Register passkey" }));
    });
    expect(container.querySelector("[data-scute-error]")?.textContent).toBe("The operation was cancelled");
    expect(screen.queryByText(PROTECTED)).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    });
    expect(screen.getByText(PROTECTED)).toBeTruthy();
  });

  it("shows verification errors with a Try again button back to login", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      verifyMagicLinkToken: vi.fn(async () => ({ data: null, error: { message: "Link expired" } })),
    });
    const { container } = renderGate(client);
    await screen.findByText("Link expired");
    expect(view(container)).toBe("error");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("renders children, and no auth UI, once authenticated", async () => {
    const { client, container } = await renderAtLogin();
    act(() => client.emitSignedIn());
    expect(screen.getByText(PROTECTED)).toBeTruthy();
    expect(container.querySelector("[data-scute-auth]")).toBeNull();
  });

  it.each([
    AUTH_CHANGE_EVENTS.MFA_REQUIRED,
    AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_REQUIRED,
    AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_SUGGESTED,
  ])("renders an empty container for %s", async (event) => {
    const { client, container } = await renderAtLogin();
    act(() => client.emit(event));
    // Known limitation, tracked separately: the gate has no default UI for the MFA views, so it renders an empty container unless renderView handles them.
    const box = container.querySelector("[data-scute-auth-container]");
    expect(box).not.toBeNull();
    expect(box!.children).toHaveLength(0);
    expect(screen.queryByText(PROTECTED)).toBeNull();
  });
});

describe("customization", () => {
  it("uses renderView output when non-null and falls back to defaults on null", async () => {
    const renderView = vi.fn((v: string, auth: any) =>
      v === "login" ? <div>Custom login for {auth.view}</div> : null
    );
    const { client } = renderGate(createFakeClient(), { renderView });
    await screen.findByText("Custom login for login");
    expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
    expect(renderView).toHaveBeenCalledWith(
      "login",
      expect.objectContaining({
        view: "login",
        submitIdentifier: expect.any(Function),
        retry: expect.any(Function),
      })
    );
    act(() => client.emit(AUTH_CHANGE_EVENTS.OTP_PENDING));
    expect(screen.getByRole("heading", { name: "Enter code" })).toBeTruthy();
  });

  it("does not consult renderView once authenticated", async () => {
    const renderView = vi.fn((_view: string, _auth: unknown) => null);
    const { client } = renderGate(createFakeClient(), { renderView });
    await screen.findByRole("heading", { name: "Sign in" });
    act(() => client.emitSignedIn());
    expect(screen.getByText(PROTECTED)).toBeTruthy();
    expect(renderView.mock.calls.map((c) => c[0])).not.toContain("authenticated");
  });

  it("applies the default theme and accent", async () => {
    const { container } = await renderAtLogin();
    const root = container.querySelector("[data-scute-auth]") as HTMLElement;
    expect(root.getAttribute("data-scute-theme")).toBe("light");
    expect(root.style.getPropertyValue("--scute-accent")).toBe("#4F46E5");
    expect(container.querySelector("[data-scute-auth-logo]")).toBeNull();
  });

  it("applies theme, accent, logo and className from appearance", async () => {
    const { container } = await renderAtLogin(createFakeClient(), {
      appearance: {
        theme: "dark",
        accentColor: "#ff0066",
        logo: <img alt="Acme logo" src="data:," />,
        className: "my-auth-gate",
      },
    });
    const root = container.querySelector("[data-scute-auth]") as HTMLElement;
    expect(root.getAttribute("data-scute-theme")).toBe("dark");
    expect(root.style.getPropertyValue("--scute-accent")).toBe("#ff0066");
    expect(screen.getByAltText("Acme logo").closest("[data-scute-auth-logo]")).not.toBeNull();
    expect(container.querySelector(".my-auth-gate")).toBe(root);
  });
});

describe("onAuthenticated", () => {
  it("is not called before sign-in and receives the user after", async () => {
    const onAuthenticated = vi.fn();
    const { client } = await renderAtLogin(createFakeClient(), { onAuthenticated });
    expect(onAuthenticated).not.toHaveBeenCalled();
    act(() => client.emitSignedIn());
    expect(onAuthenticated).toHaveBeenCalledWith(USER);
  });

  it("fires once per sign-in, not on every render", async () => {
    const onAuthenticated = vi.fn();
    const { client, rerenderGate } = await renderAtLogin(createFakeClient(), { onAuthenticated });
    act(() => client.emitSignedIn());
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
    rerenderGate({ onAuthenticated });
    rerenderGate({ onAuthenticated: onAuthenticated.bind(null) });
    act(() => client.emit(AUTH_CHANGE_EVENTS.TOKEN_REFRESHED, authenticatedSession("ACCESS.jwt.rotated"), USER));
    expect(onAuthenticated).toHaveBeenCalledTimes(1);

    // A new sign-in after a sign-out fires it again.
    await act(async () => {
      await client.signOut();
    });
    await screen.findByRole("heading", { name: "Sign in" });
    act(() => client.emitSignedIn());
    expect(onAuthenticated).toHaveBeenCalledTimes(2);
  });

  it("fires once under StrictMode", async () => {
    const onAuthenticated = vi.fn();
    const client = createFakeClient();
    const Wrapper = makeWrapper(client, { strict: true });
    render(
      <Wrapper>
        <ScuteAuthGate onAuthenticated={onAuthenticated}>
          <p>{PROTECTED}</p>
        </ScuteAuthGate>
      </Wrapper>
    );
    await screen.findByRole("heading", { name: "Sign in" });
    act(() => client.emitSignedIn());
    expect(screen.getByText(PROTECTED)).toBeTruthy();
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it("is not called while the passkey offer is showing, only once the app is shown", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const onAuthenticated = vi.fn();
    const { client } = renderGate(createFakeClient(), { onAuthenticated });
    await screen.findByRole("heading", { name: "Register a passkey" });
    act(() => client.emitSignedIn());
    expect(onAuthenticated).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    });
    expect(screen.getByText(PROTECTED)).toBeTruthy();
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
    expect(onAuthenticated).toHaveBeenCalledWith(USER);
  });

  it("lets onAuthenticated set parent state without a render-phase update warning", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createFakeClient();
    const Wrapper = makeWrapper(client);
    function Parent({ children }: { children?: ReactNode }) {
      const [who, setWho] = useState<string | null>(null);
      return (
        <ScuteAuthGate onAuthenticated={(u) => setWho(u.email)}>
          <p>{who ? `hello ${who}` : "no user yet"}</p>
          {children}
        </ScuteAuthGate>
      );
    }
    render(
      <Wrapper>
        <Parent />
      </Wrapper>
    );
    await screen.findByRole("heading", { name: "Sign in" });
    act(() => client.emitSignedIn());
    expect(screen.getByText("hello ada@example.com")).toBeTruthy();
    const messages = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("Cannot update a component"))).toBe(false);
  });
});

describe("security", () => {
  it.each([
    AUTH_CHANGE_EVENTS.MAGIC_PENDING,
    AUTH_CHANGE_EVENTS.OTP_PENDING,
    AUTH_CHANGE_EVENTS.WEBAUTHN_VERIFY_START,
    AUTH_CHANGE_EVENTS.MFA_REQUIRED,
    AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_REQUIRED,
  ])("does not render children in the pre-auth %s view", async (event) => {
    const { client } = await renderAtLogin();
    act(() => client.emit(event));
    expect(screen.queryByText(PROTECTED)).toBeNull();
  });

  it("does not render children while the passkey offer is showing, even though a session exists", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const { client } = renderGate();
    await screen.findByRole("heading", { name: "Register a passkey" });
    act(() => client.emitSignedIn());
    expect(screen.queryByText(PROTECTED)).toBeNull();
  });

  it("stops rendering children and shows the login form after the user signs out", async () => {
    const client = createFakeClient();
    const Wrapper = makeWrapper(client);
    let auth: ReturnType<typeof useAuth> | undefined;
    const Probe = () => {
      auth = useAuth();
      return null;
    };
    render(
      <Wrapper>
        <Probe />
        <ScuteAuthGate>
          <p>{PROTECTED}</p>
        </ScuteAuthGate>
      </Wrapper>
    );
    await screen.findByRole("heading", { name: "Sign in" });
    act(() => client.emitSignedIn());
    expect(screen.getByText(PROTECTED)).toBeTruthy();
    await act(async () => {
      await client.signOut();
    });
    expect(auth!.isAuthenticated).toBe(false);
    expect(screen.queryByText(PROTECTED)).toBeNull();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("stops rendering children when the session expires", async () => {
    const { client } = await renderAtLogin();
    act(() => client.emitSignedIn());
    expect(screen.getByText(PROTECTED)).toBeTruthy();
    act(() => client.emit(AUTH_CHANGE_EVENTS.SESSION_EXPIRED));
    expect(screen.queryByText(PROTECTED)).toBeNull();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("keeps rendering children for a signed-in user through events that carry no session", async () => {
    const { client } = await renderAtLogin();
    act(() => client.emitSignedIn());
    act(() => client.emit(AUTH_CHANGE_EVENTS.MAGIC_VERIFIED));
    act(() => client.emit(AUTH_CHANGE_EVENTS.WEBAUTHN_VERIFY_SUCCESS));
    expect(screen.getByText(PROTECTED)).toBeTruthy();
  });

  it("does not render children when renderView calls skipMfaEnrollment during required enrollment", async () => {
    const client = createFakeClient();
    const renderView = (v: string, auth: any) =>
      v === "mfa_enroll" ? (
        <button onClick={auth.skipMfaEnrollment}>Maybe later</button>
      ) : null;
    await renderAtLogin(client, { renderView });
    act(() => client.emit(AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_REQUIRED));
    fireEvent.click(screen.getByRole("button", { name: "Maybe later" }));
    expect(screen.queryByText(PROTECTED)).toBeNull();
    expect(screen.getByRole("button", { name: "Maybe later" })).toBeTruthy();
    expect(client.signInWithTokenPayload).not.toHaveBeenCalled();
  });

  it("renders server error text as text, not HTML", async () => {
    const payload = `<img src="x" onerror="window.__scuteXss=1">`;
    const client = createFakeClient({
      signInOrUp: vi.fn(async () => ({ data: null, error: { message: payload } })),
    });
    const { container } = await renderAtLogin(client);
    await act(async () => submitEmail("ada@example.com"));
    expect(container.querySelector("[data-scute-error]")?.textContent).toBe(payload);
    expect(container.querySelector("img")).toBeNull();
    expect((window as any).__scuteXss).toBeUndefined();
  });

  it("never puts tokens in the DOM during the magic link and passkey flow", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    renderGate();
    await screen.findByRole("heading", { name: "Register a passkey" });
    expect(document.body.innerHTML).not.toContain(ACCESS_TOKEN);
    expect(document.body.innerHTML).not.toContain(REFRESH_TOKEN);
    expect(document.body.innerHTML).not.toContain(MAGIC_TOKEN);
    fireEvent.click(screen.getByRole("button", { name: "Register passkey" }));
    await screen.findByRole("heading", { name: "Passkey registered" });
    expect(document.body.innerHTML).not.toContain(ACCESS_TOKEN);
    expect(document.body.innerHTML).not.toContain(REFRESH_TOKEN);
  });
});
