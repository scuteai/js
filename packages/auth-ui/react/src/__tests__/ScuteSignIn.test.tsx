import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScuteSignIn } from "../signin/ScuteSignIn";
import { useScuteSignInStep } from "../signin/parts";
import { textOn } from "../signin/theme";
import { ScuteAuthGate } from "../ScuteAuthGate";
import type { ScuteSignInProps } from "../signin/types";
import {
  AUTH_CHANGE_EVENTS,
  MAGIC_TOKEN,
  USER,
  createFakeClient,
  flush,
  makeWrapper,
  setUrl,
  type FakeClient,
} from "./fakeScuteClient";

function renderSignIn(client: FakeClient = createFakeClient(), props: ScuteSignInProps = {}) {
  const Wrapper = makeWrapper(client);
  const utils = render(
    <Wrapper>
      <ScuteSignIn {...props} />
    </Wrapper>
  );
  return { client, ...utils, root: () => utils.container.querySelector(".scute-signin") as HTMLElement };
}

async function atEmail(client: FakeClient = createFakeClient(), props: ScuteSignInProps = {}) {
  const r = renderSignIn(client, props);
  await screen.findByRole("heading", { name: props.copy?.title ?? "Sign in" });
  return r;
}

function submitEmail(email = "ada@example.com") {
  const input = screen.getByLabelText("Email");
  fireEvent.change(input, { target: { value: email } });
  fireEvent.submit(input.closest("form")!);
}

const boxes = (label: string) =>
  screen.getAllByRole("textbox").filter((el) => el.getAttribute("aria-label")?.startsWith(`${label}, character`)) as HTMLInputElement[];

beforeEach(() => {
  setUrl("/");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setUrl("/");
});

describe("email step", () => {
  it("renders the defaults: title, lead, a labelled email field and Continue", async () => {
    await atEmail();
    expect(screen.getByText(/Enter your email and we will send you a link or a code/)).toBeTruthy();
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    expect(input.type).toBe("email");
    expect(input.placeholder).toBe("name@company.com");
    expect(input.getAttribute("autocomplete")).toContain("email");
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    // No Google, no legal line, no logo unless asked.
    expect(screen.queryByRole("button", { name: /Google/ })).toBeNull();
    expect(screen.queryByText(/By continuing/)).toBeNull();
    expect(document.querySelector("[data-scute-auth-logo]")).toBeNull();
  });

  it("takes every copy override", async () => {
    await atEmail(createFakeClient(), {
      copy: {
        title: "Welcome back",
        subtitle: "Sign in to Acme",
        emailLabel: "Work email",
        emailPlaceholder: "you@acme.test",
        continueLabel: "Next",
      },
    });
    expect(screen.getByText("Sign in to Acme")).toBeTruthy();
    expect((screen.getByLabelText("Work email") as HTMLInputElement).placeholder).toBe("you@acme.test");
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });

  it("submits the email and shows busy on the button", async () => {
    const client = createFakeClient();
    let resolve!: (v: unknown) => void;
    client.signInOrUp.mockReturnValue(new Promise((r) => (resolve = r)));
    await atEmail(client);
    act(() => submitEmail("ada@example.com"));
    expect(client.signInOrUp).toHaveBeenCalledWith("ada@example.com");
    const button = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await act(async () => resolve({ data: null, error: null }));
  });

  it("shows Continue with Google when asked, and it starts the Google sign-in", async () => {
    const { client } = await atEmail(createFakeClient(), { methods: { google: true } });
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(client.signInWithOAuthProvider).toHaveBeenCalledWith("google");
  });

  it("links the terms and privacy policy, each only when given", async () => {
    const { unmount } = await atEmail(createFakeClient(), { legal: { termsUrl: "https://acme.test/terms", privacyUrl: "https://acme.test/privacy" } });
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("https://acme.test/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("https://acme.test/privacy");
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("rel")).toBe("noreferrer");
    unmount();
    await atEmail(createFakeClient(), { legal: { termsUrl: "/terms" } });
    expect(screen.getByRole("link", { name: "Terms" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Privacy Policy" })).toBeNull();
  });

  it("shows the API's error under the field, tied to it for screen readers", async () => {
    const client = createFakeClient({
      signInOrUp: vi.fn(async () => ({ data: null, error: { message: "This account must sign in with SSO." } })),
    });
    await atEmail(client);
    await act(async () => submitEmail());
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("This account must sign in with SSO.");
    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(alert.id);
  });

  it.each([
    ["user_banned", /banned from this app/],
    ["user_suspended", /suspended for now/],
    ["ip_blocked", /network you're on/],
    ["country_blocked", /country you're in/],
  ])("explains a %s refusal in plain words", async (code, text) => {
    const client = createFakeClient({
      signInOrUp: vi.fn(async () => ({ data: null, error: { message: "Forbidden", json: { error_code: code } } })),
    });
    await atEmail(client);
    await act(async () => submitEmail());
    expect(screen.getByRole("alert").textContent).toMatch(text);
  });

  it("explains a refusal on a magic link landing on the error step, with a way back", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      verifyMagicLinkToken: vi.fn(async () => ({ data: null, error: { message: "x", json: { error_code: "user_banned" } } })),
    });
    renderSignIn(client);
    await screen.findByRole("heading", { name: "This account can't sign in" });
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });
});

describe("appearance", () => {
  it("defaults to a light page with medium corners and the stylesheet inside", async () => {
    const { root } = await atEmail();
    expect(root().getAttribute("data-scute-theme")).toBe("light");
    expect(root().getAttribute("data-scute-layout")).toBe("page");
    expect(root().getAttribute("data-scute-radius")).toBe("medium");
    expect(root().querySelector("style")?.textContent).toContain(".scute-signin");
    expect(root().style.getPropertyValue("--scute-font")).toBe("");
    // The default illustration: a neutral icon.
    expect(root().querySelector(".scute-signin__icon")).not.toBeNull();
  });

  it("applies theme, radius, layout, accent, font, logo URL and className", async () => {
    const { root } = await atEmail(createFakeClient(), {
      appearance: {
        theme: "auto",
        radius: "large",
        layout: "card",
        accentColor: "#e9fd77",
        fontFamily: "Georgia, serif",
        logo: "https://acme.test/logo.svg",
        className: "acme-sign-in",
      },
    });
    const el = root();
    expect(el.getAttribute("data-scute-theme")).toBe("auto");
    expect(el.getAttribute("data-scute-radius")).toBe("large");
    expect(el.getAttribute("data-scute-layout")).toBe("card");
    expect(el.classList.contains("acme-sign-in")).toBe(true);
    expect(el.style.getPropertyValue("--scute-accent")).toBe("#e9fd77");
    // A light accent gets dark text.
    expect(el.style.getPropertyValue("--scute-accent-ink")).toBe("#16161a");
    expect(el.style.getPropertyValue("--scute-font")).toBe("Georgia, serif");
    expect(el.querySelector("[data-scute-auth-logo] img")?.getAttribute("src")).toBe("https://acme.test/logo.svg");
  });

  it("takes an illustration element, or none", async () => {
    function Mascot() {
      const { view, mood } = useScuteSignInStep();
      return <span data-testid="mascot">{`${view}:${mood}`}</span>;
    }
    const { client, unmount } = await atEmail(createFakeClient(), { appearance: { illustration: <Mascot /> } });
    expect(screen.getByTestId("mascot").textContent).toBe("login:idle");
    act(() => client.emit(AUTH_CHANGE_EVENTS.OTP_PENDING));
    expect(screen.getByTestId("mascot").textContent).toBe("otp_input:checking");
    unmount();
    const { root } = await atEmail(createFakeClient(), { appearance: { illustration: false } });
    expect(root().querySelector(".scute-signin__illustration")).toBeNull();
  });

  it("picks readable text for the accent", () => {
    expect(textOn("#000000")).toBe("#ffffff");
    expect(textOn("#0f766e")).toBe("#ffffff");
    expect(textOn("#ffffff")).toBe("#16161a");
    expect(textOn("#fde047")).toBe("#16161a");
    expect(textOn("rgb(255, 255, 255)")).toBe("#16161a");
    expect(textOn("tomato")).toBe("#ffffff");
  });
});

describe("code step", () => {
  async function atCode(client: FakeClient) {
    client.signInOrUp.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.OTP_PENDING);
      return { data: { otp: { id: "otp_1" } }, error: null };
    });
    await atEmail(client);
    await act(async () => submitEmail());
    await screen.findByRole("heading", { name: "Enter the code" });
  }

  it("has six labelled boxes, the first focused, and a pasted code sends itself", async () => {
    const client = createFakeClient({ verifyOtp: vi.fn(async () => ({ data: null, error: { message: "Invalid OTP" } })) });
    await atCode(client);
    const inputs = boxes("Sign-in code");
    expect(inputs).toHaveLength(6);
    expect(document.activeElement).toBe(inputs[0]);
    expect(inputs[0].getAttribute("autocomplete")).toBe("one-time-code");
    expect(inputs[0].getAttribute("inputmode")).toBe("numeric");

    await act(async () => {
      fireEvent.paste(inputs[0], { clipboardData: { getData: () => " 123 456 " } });
    });
    expect(client.verifyOtp).toHaveBeenCalledWith("123456", "ada@example.com");
    // Wrong: the boxes empty, the cursor goes back to the first, and the error says so.
    await waitFor(() => expect(boxes("Sign-in code").every((b) => b.value === "")).toBe(true));
    expect(document.activeElement).toBe(boxes("Sign-in code")[0]);
    expect(screen.getByRole("alert").textContent).toBe("That code didn't work. Check the email and try again.");
    expect(boxes("Sign-in code")[0].getAttribute("aria-invalid")).toBe("true");
  });

  it("typing moves on, Backspace on an empty box goes back, letters are ignored", async () => {
    const client = createFakeClient({ verifyOtp: vi.fn(async () => ({ data: null, error: { message: "x" } })) });
    await atCode(client);
    let inputs = boxes("Sign-in code");
    fireEvent.change(inputs[0], { target: { value: "4" } });
    inputs = boxes("Sign-in code");
    expect(inputs[0].value).toBe("4");
    expect(document.activeElement).toBe(inputs[1]);
    fireEvent.change(inputs[1], { target: { value: "x" } });
    expect(boxes("Sign-in code")[1].value).toBe("");
    fireEvent.keyDown(boxes("Sign-in code")[1], { key: "Backspace" });
    expect(document.activeElement).toBe(boxes("Sign-in code")[0]);
    expect(boxes("Sign-in code")[0].value).toBe("");
    fireEvent.keyDown(boxes("Sign-in code")[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(boxes("Sign-in code")[1]);
    expect(client.verifyOtp).not.toHaveBeenCalled();
  });

  it("offers a new code after 30 seconds, with the wait on the button", async () => {
    vi.useFakeTimers();
    const client = createFakeClient();
    client.signInOrUp.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.OTP_PENDING);
      return { data: { otp: { id: "otp_1" } }, error: null };
    });
    renderSignIn(client);
    await flush();
    await act(async () => submitEmail());
    const waiting = screen.getByRole("button", { name: "Send a new code in 30s" }) as HTMLButtonElement;
    expect(waiting.disabled).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    const ready = screen.getByRole("button", { name: "Send a new code" }) as HTMLButtonElement;
    expect(ready.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(ready);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(client.sendLoginOtp).toHaveBeenCalledWith("ada@example.com", undefined, false);
    expect(screen.getByText(/We sent a new code to/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send a new code in 30s" })).toBeTruthy();
  });
});

describe("inbox step", () => {
  it("waits for the link, offers a new one, and Use a different email goes back", async () => {
    vi.useFakeTimers();
    const client = createFakeClient();
    client.signInOrUp.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.MAGIC_PENDING);
      return { data: { magic_link: { id: "ml_1" } }, error: null };
    });
    renderSignIn(client);
    await flush();
    await act(async () => submitEmail());
    expect(screen.getByRole("heading", { name: "Check your inbox" })).toBeTruthy();
    // The title takes focus, so screen readers announce the new step.
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Check your inbox" }));
    expect(screen.getAllByRole("status").some((s) => s.textContent === "Waiting for you to open the link")).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    client.sendLoginMagicLink.mockResolvedValueOnce({ data: null, error: { message: "Rate limit exceeded" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send a new link" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("alert").textContent).toBe("Rate limit exceeded");
    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });
});

describe("attack protection's code step", () => {
  it("asks for the code sent after a magic link, and the right code goes on to the passkey offer", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      verifyMagicLinkToken: vi.fn(async () => ({
        data: { verificationRequired: true, verification: { token: "sv_tok", method: "email_otp", expires_at: "" } },
        error: null,
      })),
    });
    client.verifySignInVerification
      .mockResolvedValueOnce({ data: null, error: { message: "Invalid code" } });
    renderSignIn(client);
    await screen.findByRole("heading", { name: "Confirm it's you" });
    expect(screen.getByText(/we sent a 6-digit code to your email/)).toBeTruthy();

    await act(async () => {
      fireEvent.paste(boxes("Verification code")[0], { clipboardData: { getData: () => "000000" } });
    });
    await screen.findByText("That code didn't work. Check it and try again.");
    await act(async () => {
      fireEvent.paste(boxes("Verification code")[0], { clipboardData: { getData: () => "123456" } });
    });
    expect(client.verifySignInVerification).toHaveBeenLastCalledWith("123456", { challengeToken: "sv_tok", magicToken: MAGIC_TOKEN });
    await screen.findByRole("heading", { name: "Add a passkey" });
  });
});

describe("passkeys", () => {
  it("skips the offer where passkeys can't work and calls onSignedIn once", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const onSignedIn = vi.fn();
    const client = createFakeClient({ isWebauthnSupported: vi.fn(() => false) });
    renderSignIn(client, { onSignedIn });
    await screen.findByRole("heading", { name: "You're in" });
    expect(screen.queryByRole("heading", { name: "Add a passkey" })).toBeNull();
    expect(client.addDevice).not.toHaveBeenCalled();
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(onSignedIn).toHaveBeenCalledWith(USER);
  });

  it("says plainly when the page can't make a passkey", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      addDevice: vi.fn(async () => ({
        data: null,
        error: { message: "User ID was not between 1 and 64 characters", code: "ERROR_PASSKEYS_UNAVAILABLE" },
      })),
    });
    renderSignIn(client);
    await screen.findByRole("heading", { name: "Add a passkey" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add a passkey" }));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/can't use passkeys/);
    expect(screen.getByRole("alert").textContent).not.toMatch(/User ID/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    });
    expect(screen.getByRole("heading", { name: "You're in" })).toBeTruthy();
  });

  it("shows the passkey prompt step", async () => {
    const { client } = await atEmail();
    act(() => client.emit(AUTH_CHANGE_EVENTS.WEBAUTHN_VERIFY_START));
    expect(screen.getByRole("heading", { name: "Use your passkey" })).toBeTruthy();
  });
});

describe("what the app takes to sign in", () => {
  it.each([
    [["email"], "Email", "email"],
    [["phone"], "Phone number", "tel"],
    [["email", "phone"], "Email or phone number", "text"],
  ])("allowed_identifiers %j: the field is %s", async (allowed, label, type) => {
    const client = createFakeClient();
    client.getAppData.mockResolvedValue({ data: { allowed_identifiers: allowed }, error: null });
    renderSignIn(client);
    const input = await screen.findByLabelText(label);
    expect(input.getAttribute("type")).toBe(type);
  });

  it("signs in with a phone number when the app takes one", async () => {
    const client = createFakeClient();
    client.getAppData.mockResolvedValue({ data: { allowed_identifiers: ["phone"] }, error: null });
    renderSignIn(client);
    const input = await screen.findByLabelText("Phone number");
    fireEvent.change(input, { target: { value: "+1 201 555 0142" } });
    await act(async () => fireEvent.submit(input.closest("form")!));
    expect(client.signInOrUp).toHaveBeenCalledWith("+1 201 555 0142");
  });
});

describe("MFA step", () => {
  async function atMfa(client: FakeClient, challenge: Record<string, unknown>, methods: string[]) {
    client.signInOrUp.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.MFA_REQUIRED);
      return { data: { mfaRequired: true, mfaChallenge: challenge, availableMethods: methods }, error: null };
    });
    await atEmail(client);
    await act(async () => submitEmail());
    await screen.findByRole("heading", { name: "One more step" });
  }

  it("under StrictMode, a wrong code empties the boxes and says so (no endless Checking)", async () => {
    const client = createFakeClient({
      verifyMfaChallenge: vi.fn(async () => ({ error: { message: "", json: { error: "Invalid code" } } })),
    });
    client.signInOrUp.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.MFA_REQUIRED);
      return { data: { mfaRequired: true, mfaChallenge: { token: "chl_1", method: "totp" }, availableMethods: ["totp"] }, error: null };
    });
    const Wrapper = makeWrapper(client, { strict: true });
    render(
      <Wrapper>
        <ScuteSignIn />
      </Wrapper>
    );
    await screen.findByRole("heading", { name: "Sign in" });
    await act(async () => submitEmail());
    await screen.findByRole("heading", { name: "One more step" });
    await act(async () => {
      fireEvent.paste(boxes("Authenticator app")[0], { clipboardData: { getData: () => "000000" } });
    });
    await screen.findByText("That code didn't work. Try again.");
    expect(screen.getByRole("button", { name: "Verify" })).toBeTruthy();
    expect(boxes("Authenticator app").every((b) => (b as HTMLInputElement).value === "" && !(b as HTMLInputElement).disabled)).toBe(true);
  });

  it("asks for the authenticator code, sends it, and lists the other ways in", async () => {
    const client = createFakeClient({ verifyMfaChallenge: vi.fn(async () => ({ error: { message: "Invalid" } })) });
    await atMfa(client, { token: "chl_1", method: "totp" }, ["totp", "email", "backup_codes", "webauthn"]);
    expect(screen.getByText("Enter the 6-digit code from your authenticator app.")).toBeTruthy();
    expect(boxes("Authenticator app")).toHaveLength(6);
    // No resend for an authenticator app.
    expect(screen.queryByRole("button", { name: /Send it again/ })).toBeNull();
    // Switchable methods only (not passkeys), and not the current one.
    expect(screen.getByRole("button", { name: "Email code" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Backup code" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Passkey" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Authenticator app" })).toBeNull();

    await act(async () => {
      fireEvent.paste(boxes("Authenticator app")[0], { clipboardData: { getData: () => "246810" } });
    });
    expect(client.verifyMfaChallenge).toHaveBeenCalledWith("chl_1", "246810");
    await screen.findByText("That code didn't work. Try again.");
  });

  it("switches to a backup code with 8 boxes that take letters", async () => {
    const client = createFakeClient();
    client.switchMfaMethod.mockResolvedValue({ data: { token: "chl_2", method: "backup_code" }, error: null });
    client.verifyMfaChallenge.mockImplementation(async () => {
      client.emitSignedIn();
      return { error: null };
    });
    await atMfa(client, { token: "chl_1", method: "totp" }, ["totp", "backup_codes"]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Backup code" }));
    });
    expect(client.switchMfaMethod).toHaveBeenCalledWith("chl_1", "backup_code");
    expect(screen.getByText(/8-character backup codes/)).toBeTruthy();
    const inputs = boxes("Backup code");
    expect(inputs).toHaveLength(8);
    expect(inputs[0].getAttribute("inputmode")).toBe("text");
    await act(async () => {
      fireEvent.paste(inputs[0], { clipboardData: { getData: () => "ab12-cd34" } });
    });
    // Sent as the code is shown (XXXX-XXXX), which every API version takes.
    expect(client.verifyMfaChallenge).toHaveBeenCalledWith("chl_2", "AB12-CD34");
    await screen.findByRole("heading", { name: "You're in" });
  });

  it("resends an emailed code", async () => {
    const client = createFakeClient();
    client.resendChallenge.mockResolvedValue({ data: { challenge: { token: "chl_9", method: "email_otp", delivery_required: true } }, error: null });
    await atMfa(client, { token: "chl_1", method: "email_otp", delivery_required: true }, ["email"]);
    expect(screen.getByText("Enter the 6-digit code we just emailed you.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send it again" }));
    });
    expect(client.resendChallenge).toHaveBeenCalledWith("chl_1");
    expect(screen.getByText(/We sent a new code/)).toBeTruthy();
  });
});

describe("ScuteAuthGate", () => {
  it("renders ScuteSignIn with copy, legal and methods, then the app once signed in", async () => {
    const client = createFakeClient();
    const Wrapper = makeWrapper(client);
    render(
      <Wrapper>
        <ScuteAuthGate
          appearance={{ theme: "dark", radius: "small" }}
          copy={{ title: "Sign in to Acme" }}
          legal={{ privacyUrl: "/privacy" }}
          methods={{ google: true }}
        >
          <p>App</p>
        </ScuteAuthGate>
      </Wrapper>
    );
    await screen.findByRole("heading", { name: "Sign in to Acme" });
    expect(document.querySelector(".scute-signin")?.getAttribute("data-scute-theme")).toBe("dark");
    expect(document.querySelector(".scute-signin")?.getAttribute("data-scute-radius")).toBe("small");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    act(() => client.emitSignedIn());
    expect(screen.getByText("App")).toBeTruthy();
    expect(document.querySelector(".scute-signin")).toBeNull();
  });
});

describe("defaultEmail", () => {
  it("starts the field with it, and sends it as is", async () => {
    const { client } = await atEmail(createFakeClient(), { defaultEmail: "grace@example.com" });
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    expect(input.value).toBe("grace@example.com");
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    expect(client.signInOrUp).toHaveBeenCalledWith("grace@example.com");
  });

  it("fills the field when it arrives after the step showed, unless the visitor typed", async () => {
    const client = createFakeClient();
    const Wrapper = makeWrapper(client);
    const { rerender } = render(<Wrapper><ScuteSignIn /></Wrapper>);
    await screen.findByRole("heading", { name: "Sign in" });
    rerender(<Wrapper><ScuteSignIn defaultEmail="late@example.com" /></Wrapper>);
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("late@example.com");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "typed@example.com" } });
    rerender(<Wrapper><ScuteSignIn defaultEmail="later@example.com" /></Wrapper>);
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("typed@example.com");
  });

  it("is not offered again after Use a different email", async () => {
    const client = createFakeClient();
    client.signInOrUp.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.MAGIC_PENDING);
      return { data: { magic_link: { id: "ml_1" } }, error: null };
    });
    await atEmail(client, { defaultEmail: "grace@example.com" });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
    });
    await screen.findByRole("heading", { name: "Check your inbox" });
    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("");
  });

  it("is passed on by ScuteAuthGate", async () => {
    const Wrapper = makeWrapper(createFakeClient());
    render(
      <Wrapper>
        <ScuteAuthGate defaultEmail="grace@example.com">
          <p>App</p>
        </ScuteAuthGate>
      </Wrapper>
    );
    await screen.findByRole("heading", { name: "Sign in" });
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("grace@example.com");
  });
});

describe("preview", () => {
  // No AuthContextProvider: a preview needs no client.
  const show = (props: ScuteSignInProps) => {
    const utils = render(<ScuteSignIn {...props} />);
    return { ...utils, root: () => utils.container.querySelector(".scute-signin") as HTMLElement };
  };

  it("draws the email step with the props, without a client, and takes no focus", () => {
    const { root } = show({ preview: "login", copy: { title: "Sign in to Acme" }, appearance: { theme: "dark" }, methods: { google: true } });
    expect(screen.getByRole("heading", { name: "Sign in to Acme" })).toBeTruthy();
    expect(root().getAttribute("data-scute-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    expect(document.activeElement).toBe(document.body);
    // Its buttons do nothing.
    fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
    expect(screen.getByRole("heading", { name: "Sign in to Acme" })).toBeTruthy();
  });

  it("shows defaultEmail, or a refusal under the field", () => {
    const { unmount } = show({ preview: "login", defaultEmail: "ada@acme.test" });
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("ada@acme.test");
    unmount();
    show({ preview: { view: "login", email: "ada@acme.test", errorCode: "ip_blocked", error: "Forbidden" } });
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("ada@acme.test");
    expect(screen.getByRole("alert").textContent).toMatch(/network you're on/);
  });

  it.each([
    ["magic_pending", "Check your inbox"],
    ["magic_verifying", "Signing you in"],
    ["otp_input", "Enter the code"],
    ["verification_required", "Confirm it's you"],
    ["webauthn_verify", "Use your passkey"],
    ["webauthn_register", "Add a passkey"],
    ["mfa_verify", "One more step"],
    ["mfa_enroll_suggest", "Set up two-step verification"],
    ["authenticated", "You're in"],
  ] as const)("draws %s", (view, title) => {
    show({ preview: view });
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(document.querySelector(`[data-scute-view="${view}"]`)).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("uses the sample data: the address, a wrong code, the MFA method and the others", () => {
    const { rerender } = show({ preview: { view: "otp_input", email: "ada@acme.test" } });
    expect(screen.getByText("ada@acme.test")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(<ScuteSignIn preview={{ view: "otp_input", email: "ada@acme.test", error: "Invalid code" }} />);
    expect(screen.getByRole("alert").textContent).toBe("That code didn't work. Check the email and try again.");
    rerender(<ScuteSignIn preview={{ view: "mfa_verify", mfaMethod: "backup_code", mfaMethods: ["totp", "backup_codes", "email"] }} />);
    expect(boxes("Backup code")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Authenticator app" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Email code" })).toBeTruthy();
    rerender(<ScuteSignIn preview={{ view: "error", error: "Magic link not found or expired" }} />);
    expect(screen.getByRole("heading", { name: "This link has expired" })).toBeTruthy();
  });

  it("never calls onSignedIn", () => {
    const onSignedIn = vi.fn();
    show({ preview: "authenticated", onSignedIn });
    expect(screen.getByText("you@example.com")).toBeTruthy();
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});

describe("fill layout", () => {
  it("is the page layout sized to its container, not the window", async () => {
    const { root } = await atEmail(createFakeClient(), { appearance: { layout: "fill" } });
    expect(root().getAttribute("data-scute-layout")).toBe("fill");
    const css = root().querySelector("style")!.textContent!;
    // Its own rule (not the one it shares with "page").
    const fill = css.match(/\}\s*\.scute-signin\[data-scute-layout="fill"\] \{([^}]*)\}/)![1];
    expect(fill).toContain("height: 100%");
    expect(fill).not.toContain("100vh");
  });
});

describe("app settings that don't load", () => {
  it("shows an error step instead of the email, and Try again loads them again", async () => {
    const client = createFakeClient({
      _initialize: vi.fn(async () => ({ error: { message: "Failed to fetch" } })),
    });
    let settings = { data: null as any, error: { message: "Failed to fetch" } as any };
    client.getAppData.mockImplementation(async () => settings);
    renderSignIn(client);
    await screen.findByRole("heading", { name: "Sign-in isn't available right now" });
    expect(screen.getByText(/couldn't load this app's sign-in settings/)).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();

    // Still failing: the same step again.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    await screen.findByRole("heading", { name: "Sign-in isn't available right now" });
    expect(client.getAppData).toHaveBeenCalledWith(true);

    settings = { data: { passkeys_enabled: true }, error: null };
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    await screen.findByRole("heading", { name: "Sign in" });
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });

  it("still finishes a magic link landing", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      _initialize: vi.fn(async () => ({ error: { message: "Failed to fetch" } })),
    });
    renderSignIn(client);
    await flush();
    expect(client.verifyMagicLinkToken).toHaveBeenCalledWith(MAGIC_TOKEN);
  });
});

describe("Trust this device (MFA step)", () => {
  async function atMfaWith(appData: Record<string, unknown>) {
    const client = createFakeClient({ verifyMfaChallenge: vi.fn(async () => ({ error: null, deviceTrusted: true })) });
    client.getAppData.mockResolvedValue({ data: { ...appData }, error: null });
    client.signInOrUp.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.MFA_REQUIRED);
      return { data: { mfaRequired: true, mfaChallenge: { token: "chl_1", method: "totp" }, availableMethods: ["totp"] }, error: null };
    });
    await atEmail(client);
    await act(async () => submitEmail());
    await screen.findByRole("heading", { name: "One more step" });
    return client;
  }

  it("is offered when the app lets people trust devices, off until ticked, and sent with the code", async () => {
    const client = await atMfaWith({ allowed_identifiers: ["email"], device_trust_enabled: true, device_trust_days: 30 });
    const box = screen.getByRole("checkbox", { name: "Trust this device for 30 days" }) as HTMLInputElement;
    expect(box.checked).toBe(false);

    await act(async () => fireEvent.click(box));
    expect(box.checked).toBe(true);
    await act(async () => {
      fireEvent.paste(boxes("Authenticator app")[0], { clipboardData: { getData: () => "246810" } });
    });
    expect(client.verifyMfaChallenge).toHaveBeenCalledWith("chl_1", "246810", { trustDevice: true });
  });

  it("sends an unticked box as no", async () => {
    const client = await atMfaWith({ allowed_identifiers: ["email"], device_trust_enabled: true, device_trust_days: 1 });
    expect(screen.getByRole("checkbox", { name: "Trust this device for 1 day" })).toBeTruthy();

    await act(async () => {
      fireEvent.paste(boxes("Authenticator app")[0], { clipboardData: { getData: () => "246810" } });
    });
    expect(client.verifyMfaChallenge).toHaveBeenCalledWith("chl_1", "246810", { trustDevice: false });
  });

  it("isn't there when the app doesn't allow it, and nothing about trust is sent", async () => {
    const client = await atMfaWith({ allowed_identifiers: ["email"], device_trust_enabled: false, device_trust_days: 30 });
    expect(screen.queryByRole("checkbox")).toBeNull();

    await act(async () => {
      fireEvent.paste(boxes("Authenticator app")[0], { clipboardData: { getData: () => "246810" } });
    });
    expect(client.verifyMfaChallenge).toHaveBeenCalledWith("chl_1", "246810");
  });

  it("shows in a preview with deviceTrustDays", () => {
    render(<ScuteSignIn preview={{ view: "mfa_verify", deviceTrustDays: 14 }} />);
    expect(screen.getByRole("checkbox", { name: "Trust this device for 14 days" })).toBeTruthy();
  });
});
