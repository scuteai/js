import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScuteSignIn } from "../signin/ScuteSignIn";
import { getLastUsedMethod, markLastUsedMethod } from "../signin/lastUsed";
import type { ScuteSignInProps } from "../signin/types";
import { MAGIC_TOKEN, createFakeClient, flush, makeWrapper, setUrl, type FakeClient } from "./fakeScuteClient";

const LAST = "scute_last_auth_method";
const PENDING = "scute_last_auth_pending";

async function atEmail(props: ScuteSignInProps = {}, client: FakeClient = createFakeClient()) {
  const Wrapper = makeWrapper(client);
  render(<Wrapper><ScuteSignIn {...props} /></Wrapper>);
  await screen.findByRole("heading", { name: "Sign in" });
  return client;
}

const continueBtn = () => screen.getByRole("button", { name: /^Continue\s*(Last used)?$/ });
const googleBtn = () => screen.getByRole("button", { name: /Continue with Google/ });
const tagged = (el: HTMLElement) => el.hasAttribute("data-last-used") && !!el.querySelector("[data-scute-last-used]");

beforeEach(() => {
  localStorage.clear();
  setUrl("/");
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  setUrl("/");
});

describe("Last used tag", () => {
  it("tags Continue with Google after a Google sign-in", async () => {
    localStorage.setItem(LAST, "google");
    await atEmail({ methods: { google: true } });
    expect(tagged(googleBtn())).toBe(true);
    expect(tagged(continueBtn())).toBe(false);
    expect(googleBtn().textContent).toContain("Last used");
  });

  it.each(["email", "phone", "passkey", "sso"])("tags Continue after a %s sign-in", async (method) => {
    localStorage.setItem(LAST, method);
    await atEmail({ methods: { google: true } });
    expect(tagged(continueBtn())).toBe(true);
    expect(tagged(googleBtn())).toBe(false);
  });

  it("tags nothing with only one way to sign in", async () => {
    localStorage.setItem(LAST, "email");
    await atEmail();
    expect(document.querySelector("[data-scute-last-used]")).toBeNull();
  });

  it("tags nothing when showLastUsed is false", async () => {
    localStorage.setItem(LAST, "google");
    await atEmail({ methods: { google: true }, showLastUsed: false });
    expect(document.querySelector("[data-scute-last-used]")).toBeNull();
  });

  it("tags nothing on a first visit", async () => {
    await atEmail({ methods: { google: true } });
    expect(document.querySelector("[data-scute-last-used]")).toBeNull();
  });

  it("tags nothing for a provider the form doesn't show", async () => {
    localStorage.setItem(LAST, "github");
    await atEmail({ methods: { google: true } });
    expect(document.querySelector("[data-scute-last-used]")).toBeNull();
  });
});

describe("remembering the way", () => {
  it("notes Google when it starts, and keeps it once the session arrives", async () => {
    const client = await atEmail({ methods: { google: true } });
    fireEvent.click(googleBtn());
    expect(client.signInWithOAuthProvider).toHaveBeenCalledWith("google");
    // Not the last used one until a session arrives.
    expect(getLastUsedMethod()).toBeNull();
    expect(JSON.parse(localStorage.getItem(PENDING)!).method).toBe("google");
    await act(async () => client.emitSignedIn());
    await flush();
    expect(getLastUsedMethod()).toBe("google");
    expect(localStorage.getItem(PENDING)).toBeNull();
  });

  it("an abandoned start leaves the last used one alone", async () => {
    localStorage.setItem(LAST, "email");
    await atEmail({ methods: { google: true } });
    fireEvent.click(googleBtn());
    expect(getLastUsedMethod()).toBe("email");
  });

  it("an email typed in becomes email once signed in", async () => {
    const client = createFakeClient();
    client.signInOrUp.mockResolvedValue({ data: { magic_link: { id: 1 } }, error: null });
    await atEmail({}, client);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
    });
    await act(async () => client.emitSignedIn());
    await flush();
    expect(getLastUsedMethod()).toBe("email");
  });

  it("a passkey sign-in is remembered as passkey", async () => {
    const client = createFakeClient();
    client.signInOrUp.mockResolvedValue({ data: null, error: null });
    await atEmail({}, client);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
    });
    await act(async () => client.emitSignedIn());
    await flush();
    expect(getLastUsedMethod()).toBe("passkey");
  });

  it("a link opened where no sign-in started is the email", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({ isWebauthnSupported: vi.fn(() => false) });
    const Wrapper = makeWrapper(client);
    render(<Wrapper><ScuteSignIn /></Wrapper>);
    await screen.findByRole("heading", { name: "You're in" });
    expect(getLastUsedMethod()).toBe("email");
  });

  it("a page's own start (SSO) is kept the same way", async () => {
    markLastUsedMethod("sso");
    const client = await atEmail();
    await act(async () => client.emitSignedIn());
    await flush();
    expect(getLastUsedMethod()).toBe("sso");
  });

  it("a stale start (over an hour old) is not taken", async () => {
    localStorage.setItem(PENDING, JSON.stringify({ method: "google", at: Date.now() - 2 * 60 * 60 * 1000 }));
    const client = await atEmail();
    await act(async () => client.emitSignedIn());
    await flush();
    expect(getLastUsedMethod()).toBeNull();
  });
});

describe("preview", () => {
  it("draws the tag from preview.lastUsed", () => {
    render(<ScuteSignIn preview={{ view: "login", lastUsed: "google" }} methods={{ google: true }} />);
    expect(tagged(screen.getByRole("button", { name: /Continue with Google/ }))).toBe(true);
  });
});
