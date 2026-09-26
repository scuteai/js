/**
 * useScuteAuthFlow: characterization tests (REF-17).
 *
 * Replaces the earlier placeholder "spec" that only printed test names. It
 * listed these behaviors; each is covered below against the current code:
 *   1. initial view is "loading"
 *   2. "login" after SDK init when there is no magic token
 *   3. submitIdentifier calls signInOrUp (not signIn)
 *   4. magic token in URL -> "magic_verifying" -> verifyMagicLinkToken
 *   5. magic verify -> "webauthn_register" (no hasExistingDevice check)
 *   6. sct_sk=true -> skip passkey, sign in directly
 *      NO LONGER TRUE: sct_sk is scrubbed from the URL before it is read,
 *      so registration is still offered. Pinned in "magic link callback".
 *   7. registerPasskey -> signInWithTokenPayload + addDevice -> success -> authenticated
 *   8. skipPasskey -> signInWithTokenPayload only -> "authenticated"
 *      NO LONGER TRUE: the SIGNED_IN it triggers is ignored while in the
 *      register view, so the view stays "webauthn_register". Pinned below.
 *   9. OTP_PENDING -> "otp_input"; WEBAUTHN_VERIFY_START -> "webauthn_verify"
 *  10. SIGNED_IN -> "authenticated" unless in the register flow
 *  11. magic link polling every 2s while pending, stops on success
 *  12. retry resets to login
 *  13. URL cleanup after magic verify
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@scute/react-hooks";
import { useScuteAuthFlow } from "../useScuteAuthFlow";
import {
  ACCESS_TOKEN,
  AUTH_CHANGE_EVENTS,
  AUTH_PAYLOAD,
  MAGIC_TOKEN,
  REFRESH_TOKEN,
  USER,
  createFakeClient,
  deferred,
  flush,
  makeWrapper,
  setUrl,
  type FakeClient,
} from "./fakeScuteClient";

function renderFlow(client: FakeClient = createFakeClient(), opts: { strict?: boolean } = {}) {
  const rendered = renderHook(
    () => ({ flow: useScuteAuthFlow(), auth: useAuth() }),
    { wrapper: makeWrapper(client, opts) }
  );
  return { client, ...rendered };
}

async function renderAtLogin(client: FakeClient = createFakeClient()) {
  const r = renderFlow(client);
  await waitFor(() => expect(r.result.current.flow.view).toBe("login"));
  return r;
}

/** Magic link callback that lands on the passkey registration offer. */
async function renderAtRegister(client: FakeClient = createFakeClient()) {
  setUrl(`/auth/callback?sct_magic=${MAGIC_TOKEN}`);
  const r = renderFlow(client);
  await waitFor(() => expect(r.result.current.flow.view).toBe("webauthn_register"));
  return r;
}

function magicLinkSignIn(client: FakeClient, id = "ml_42") {
  client.signInOrUp.mockImplementation(async () => {
    client.emit(AUTH_CHANGE_EVENTS.MAGIC_PENDING);
    return { data: { magic_link: { id } }, error: null };
  });
}

function otpSignIn(client: FakeClient) {
  client.signInOrUp.mockImplementation(async () => {
    client.emit(AUTH_CHANGE_EVENTS.OTP_PENDING);
    return { data: { otp: { id: "otp_1" } }, error: null };
  });
}

const mfaRequiredData = {
  mfaRequired: true,
  mfaEnrollmentRequired: false,
  mfaGracePeriod: false,
  mfaGraceDaysRemaining: undefined,
  mfaChallenge: { token: "chl_mfa_1", method: "totp", status: "pending" },
  availableMethods: ["totp", "backup_code"],
};

beforeEach(() => {
  setUrl("/");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setUrl("/");
});

describe("initialization", () => {
  it("starts in the loading view until the SDK finishes initializing", async () => {
    const init = deferred<any>();
    const client = createFakeClient({ _initialize: vi.fn(() => init.promise) });
    const { result } = renderFlow(client);
    expect(result.current.flow.view).toBe("loading");
    await flush();
    expect(result.current.flow.view).toBe("loading");
    await act(async () => init.resolve({ error: null }));
    await waitFor(() => expect(result.current.flow.view).toBe("login"));
  });

  it("moves to login after init when there is no magic token", async () => {
    const { client, result } = await renderAtLogin();
    expect(client._initialize).toHaveBeenCalledTimes(1);
    expect(client.getMagicLinkToken).toHaveBeenCalled();
    expect(client.verifyMagicLinkToken).not.toHaveBeenCalled();
    expect(result.current.flow.isAuthenticated).toBe(false);
    expect(result.current.flow.error).toBeNull();
    expect(result.current.flow.identifier).toBe("");
    expect(result.current.flow.submitting).toBe(false);
  });

  it("still reaches login when _initialize rejects", async () => {
    const client = createFakeClient({
      _initialize: vi.fn(async () => {
        throw new Error("network down");
      }),
    });
    await renderAtLogin(client);
  });

  it("initializes once under StrictMode", async () => {
    const client = createFakeClient();
    const { result } = renderFlow(client, { strict: true });
    await waitFor(() => expect(result.current.flow.view).toBe("login"));
    expect(client._initialize).toHaveBeenCalledTimes(1);
  });

  it("goes straight to authenticated when the session resolves after init", async () => {
    const { client, result } = await renderAtLogin();
    act(() => client.emitSignedIn());
    expect(result.current.flow.view).toBe("authenticated");
    expect(result.current.flow.isAuthenticated).toBe(true);
    expect(result.current.flow.user).toEqual(USER);
  });

  it("lands on login even though signed in when the session resolves before init", async () => {
    const init = deferred<any>();
    const client = createFakeClient({ _initialize: vi.fn(() => init.promise) });
    const { result } = renderFlow(client);
    act(() => client.emitSignedIn());
    expect(result.current.flow.view).toBe("authenticated");
    await act(async () => init.resolve({ error: null }));
    await flush();
    // CURRENT BEHAVIOR (suspected bug): the init effect reads isAuthenticated
    // from the first render's closure (false), so if SIGNED_IN lands before
    // _initialize() resolves it overwrites "authenticated" with "login". The
    // user is signed in but the gate shows the login form. With the real
    // client _initialize usually resolves first, so this needs that ordering.
    expect(result.current.flow.view).toBe("login");
    expect(result.current.auth.isAuthenticated).toBe(true);
    expect(result.current.flow.isAuthenticated).toBe(true);
  });
});

describe("magic link callback", () => {
  it("verifies the sct_magic token and offers passkey registration", async () => {
    setUrl(`/auth/callback?sct_magic=${MAGIC_TOKEN}`);
    const verify = deferred<any>();
    const client = createFakeClient({ verifyMagicLinkToken: vi.fn(() => verify.promise) });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("magic_verifying"));
    expect(client.verifyMagicLinkToken).toHaveBeenCalledTimes(1);
    expect(client.verifyMagicLinkToken).toHaveBeenCalledWith(MAGIC_TOKEN);

    await act(async () =>
      verify.resolve({ data: { authPayload: AUTH_PAYLOAD, magicPayload: {} }, error: null })
    );
    await waitFor(() => expect(result.current.flow.view).toBe("webauthn_register"));
    // Always offered: no "does this user already have a passkey" check.
    expect(client.getAppData).toHaveBeenCalled();
    expect(client.signInWithTokenPayload).not.toHaveBeenCalled();
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.flow.isAuthenticated).toBe(false);
  });

  it("verifies an sct_oauth token (social OAuth / SAML) and signs straight in, no passkey offer", async () => {
    setUrl("/cb?sct_oauth=OAUTH.handoff.tok&keep=1");
    const { client, result } = renderFlow();
    await waitFor(() => expect(client.signInWithTokenPayload).toHaveBeenCalledWith(AUTH_PAYLOAD));
    expect(client.verifyMagicLinkToken).toHaveBeenCalledWith("OAUTH.handoff.tok");
    expect(result.current.flow.view).not.toBe("webauthn_register");
    expect(window.location.search).toBe("?keep=1");
  });

  it("scrubs sct_magic, sct_oauth and sct_sk from the URL, keeping other params and the hash", async () => {
    setUrl(
      `/auth/callback?next=%2Fdashboard&sct_magic=${MAGIC_TOKEN}&utm_source=email&sct_oauth=OAUTH.x&sct_sk=true#section-2`
    );
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    let hrefAtVerify = "";
    const client = createFakeClient({
      verifyMagicLinkToken: vi.fn(async () => {
        hrefAtVerify = window.location.href;
        return { data: { authPayload: AUTH_PAYLOAD, magicPayload: {} }, error: null };
      }),
    });
    renderFlow(client);
    await waitFor(() => expect(client.signInWithTokenPayload).toHaveBeenCalled());

    // Scrubbed synchronously before the verify request goes out (SEC-36).
    expect(hrefAtVerify).not.toContain("sct_magic");
    expect(hrefAtVerify).not.toContain("sct_oauth");
    expect(hrefAtVerify).not.toContain("sct_sk");
    expect(hrefAtVerify).not.toContain(MAGIC_TOKEN);

    expect(window.location.pathname).toBe("/auth/callback");
    expect(window.location.search).toBe("?next=%2Fdashboard&utm_source=email");
    expect(window.location.hash).toBe("#section-2");
    expect(window.location.href).not.toContain(MAGIC_TOKEN);

    expect(replaceSpy).toHaveBeenCalled();
    for (const call of replaceSpy.mock.calls) {
      expect(String(call[2])).not.toContain("sct_magic");
      expect(String(call[2])).not.toContain(MAGIC_TOKEN);
    }
  });

  it("still scrubs the token when verification returns an error", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}&a=1`);
    const client = createFakeClient({
      verifyMagicLinkToken: vi.fn(async () => ({ data: null, error: { message: "Link expired" } })),
    });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("error"));
    expect(result.current.flow.error).toBe("Link expired");
    expect(window.location.search).toBe("?a=1");
  });

  it("uses a generic message when the verify error has none", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      verifyMagicLinkToken: vi.fn(async () => ({ data: null, error: {} })),
    });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("error"));
    expect(result.current.flow.error).toBe("Invalid or expired link");
  });

  it("still scrubs the token and shows an error when verification throws", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}&a=1`);
    const client = createFakeClient({
      verifyMagicLinkToken: vi.fn(async () => {
        throw new Error("fetch failed");
      }),
    });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("error"));
    expect(result.current.flow.error).toBe("fetch failed");
    expect(window.location.href).not.toContain(MAGIC_TOKEN);
    expect(window.location.search).toBe("?a=1");
  });

  it("verifies the single-use token only once under StrictMode", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const { client, result } = renderFlow(createFakeClient(), { strict: true });
    await waitFor(() => expect(result.current.flow.view).toBe("webauthn_register"));
    expect(client.verifyMagicLinkToken).toHaveBeenCalledTimes(1);
  });

  it("honours sct_sk=true: reads it before scrubbing and signs straight in", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}&sct_sk=true`);
    let hrefAtVerify = "";
    const client = createFakeClient({
      verifyMagicLinkToken: vi.fn(async () => {
        hrefAtVerify = window.location.href;
        return { data: { authPayload: AUTH_PAYLOAD, magicPayload: {} }, error: null };
      }),
    });
    const { result } = renderFlow(client);
    await waitFor(() => expect(client.signInWithTokenPayload).toHaveBeenCalledWith(AUTH_PAYLOAD));
    expect(hrefAtVerify).not.toContain("sct_sk");
    expect(result.current.flow.view).not.toBe("webauthn_register");
  });

  it("sct_sk with any value other than true doesn't skip the offer", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}&sct_sk=1`);
    const { client, result } = renderFlow();
    await waitFor(() => expect(result.current.flow.view).toBe("webauthn_register"));
    expect(client.signInWithTokenPayload).not.toHaveBeenCalled();
  });

  it("signs in directly when the app has passkeys disabled", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      getAppData: vi.fn(async () => ({ data: { passkeys_enabled: false }, error: null })),
    });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("authenticated"));
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1);
    expect(client.signInWithTokenPayload).toHaveBeenCalledWith(AUTH_PAYLOAD);
    expect(result.current.auth.isAuthenticated).toBe(true);
  });

  it("offers passkey registration when passkeys_enabled is missing from app data", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      getAppData: vi.fn(async () => ({ data: { name: "App" }, error: null })),
    });
    const { result } = renderFlow(client);
    // CURRENT BEHAVIOR (suspected bug): `passkeys_enabled !== false` treats a
    // missing flag as enabled (fail open, SEC-40).
    await waitFor(() => expect(result.current.flow.view).toBe("webauthn_register"));
  });

  it("offers passkey registration when app data fails to load", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      getAppData: vi.fn(async () => ({ data: null, error: { message: "503" } })),
    });
    const { result } = renderFlow(client);
    // CURRENT BEHAVIOR (suspected bug): a failed config load yields
    // appData=null, and `null?.passkeys_enabled !== false` is true, so the
    // app's "passkeys off" setting is bypassed (fail open, SEC-40).
    await waitFor(() => expect(result.current.flow.view).toBe("webauthn_register"));
    expect(client.signInWithTokenPayload).not.toHaveBeenCalled();
  });

  it("stores MFA state and follows MFA_REQUIRED when the link needs a second factor", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient();
    client.verifyMagicLinkToken.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.MFA_REQUIRED);
      return { data: mfaRequiredData, error: null };
    });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("mfa_verify"));
    expect(result.current.flow.mfaChallenge).toEqual(mfaRequiredData.mfaChallenge);
    expect(result.current.flow.mfaAvailableMethods).toEqual(["totp", "backup_code"]);
    expect(result.current.flow.mfaGracePeriod).toBe(false);
    expect(client.getAppData).not.toHaveBeenCalled();
    expect(client.signInWithTokenPayload).not.toHaveBeenCalled();
  });

  it("stores grace-period info and follows MFA_ENROLLMENT_REQUIRED", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient();
    client.verifyMagicLinkToken.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_REQUIRED);
      return {
        data: {
          ...mfaRequiredData,
          mfaEnrollmentRequired: true,
          mfaGracePeriod: true,
          mfaGraceDaysRemaining: 3,
          availableMethods: undefined,
        },
        error: null,
      };
    });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("mfa_enroll"));
    expect(result.current.flow.mfaGracePeriod).toBe(true);
    expect(result.current.flow.mfaGraceDaysRemaining).toBe(3);
    expect(result.current.flow.mfaAvailableMethods).toEqual([]);
  });

  it("does not navigate anywhere, even with a redirect-looking param in the URL", async () => {
    setUrl(`/cb?next=https%3A%2F%2Fevil.example%2Fsteal&sct_magic=${MAGIC_TOKEN}`);
    const originBefore = window.location.origin;
    const client = createFakeClient({
      getAppData: vi.fn(async () => ({ data: { passkeys_enabled: false }, error: null })),
    });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("authenticated"));
    // Only the token is removed; the hook never follows `next` (it has no
    // redirect logic at all), leaving any redirect decision to the app.
    expect(window.location.href).toBe(
      `${originBefore}/cb?next=https%3A%2F%2Fevil.example%2Fsteal`
    );
  });
});

describe("submitIdentifier", () => {
  it("calls signInOrUp with the identifier and tracks submitting", async () => {
    const client = createFakeClient();
    const pending = deferred<any>();
    client.signInOrUp.mockReturnValue(pending.promise);
    const { result } = await renderAtLogin(client);

    let call!: Promise<void>;
    act(() => {
      call = result.current.flow.submitIdentifier("ada@example.com");
    });
    expect(result.current.flow.submitting).toBe(true);
    expect(result.current.flow.identifier).toBe("ada@example.com");
    expect(client.signInOrUp).toHaveBeenCalledTimes(1);
    expect(client.signInOrUp).toHaveBeenCalledWith("ada@example.com");

    await act(async () => {
      pending.resolve({ data: null, error: null });
      await call;
    });
    expect(result.current.flow.submitting).toBe(false);
    // data=null means passkey sign-in succeeded; the view waits for SIGNED_IN.
    expect(result.current.flow.view).toBe("login");
    act(() => client.emitSignedIn());
    expect(result.current.flow.view).toBe("authenticated");
  });

  it("falls back to the identifier in state when called without an argument", async () => {
    const { client, result } = await renderAtLogin();
    act(() => result.current.flow.setIdentifier("+15555550100"));
    await act(async () => {
      await result.current.flow.submitIdentifier();
    });
    expect(client.signInOrUp).toHaveBeenCalledWith("+15555550100");
  });

  it("passes the identifier through untrimmed and unvalidated", async () => {
    const { client, result } = await renderAtLogin();
    await act(async () => {
      await result.current.flow.submitIdentifier("  Ada@Example.COM ");
    });
    expect(client.signInOrUp).toHaveBeenCalledWith("  Ada@Example.COM ");
  });

  it("does nothing for an empty identifier", async () => {
    const { client, result } = await renderAtLogin();
    await act(async () => {
      await result.current.flow.submitIdentifier("");
    });
    expect(client.signInOrUp).not.toHaveBeenCalled();
    expect(result.current.flow.submitting).toBe(false);
  });

  it("ignores a second submit once the submitting state has rendered", async () => {
    const client = createFakeClient();
    const pending = deferred<any>();
    client.signInOrUp.mockReturnValue(pending.promise);
    const { result } = await renderAtLogin(client);
    act(() => {
      result.current.flow.submitIdentifier("ada@example.com");
    });
    await act(async () => {
      await result.current.flow.submitIdentifier("ada@example.com");
    });
    expect(client.signInOrUp).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ data: null, error: null }));
  });

  it("lets two submits in the same tick both through", async () => {
    const { client, result } = await renderAtLogin();
    const submit = result.current.flow.submitIdentifier;
    // CURRENT BEHAVIOR (suspected bug): the double-submit guard reads the
    // `submitting` state from the closure, so a double click before React
    // re-renders sends two sign-in requests (two magic links / OTPs).
    await act(async () => {
      await Promise.all([submit("ada@example.com"), submit("ada@example.com")]);
    });
    expect(client.signInOrUp).toHaveBeenCalledTimes(2);
  });

  it("shows the sign-in error message and stays on login", async () => {
    const client = createFakeClient({
      signInOrUp: vi.fn(async () => ({ data: null, error: { message: "Identifier not recognized" } })),
    });
    const { result } = await renderAtLogin(client);
    await act(async () => {
      await result.current.flow.submitIdentifier("nobody@example.com");
    });
    expect(result.current.flow.error).toBe("Identifier not recognized");
    expect(result.current.flow.view).toBe("login");
    expect(result.current.flow.submitting).toBe(false);
  });

  it("reports thrown errors, with a fallback message", async () => {
    const client = createFakeClient();
    const { result } = await renderAtLogin(client);
    client.signInOrUp.mockRejectedValueOnce(new Error("Network request failed"));
    await act(async () => {
      await result.current.flow.submitIdentifier("ada@example.com");
    });
    expect(result.current.flow.error).toBe("Network request failed");

    client.signInOrUp.mockRejectedValueOnce({});
    await act(async () => {
      await result.current.flow.submitIdentifier("ada@example.com");
    });
    expect(result.current.flow.error).toBe("Failed to sign in");
    expect(result.current.flow.submitting).toBe(false);
  });

  it("moves to magic_pending on MAGIC_PENDING", async () => {
    const client = createFakeClient();
    magicLinkSignIn(client);
    const { result } = await renderAtLogin(client);
    await act(async () => {
      await result.current.flow.submitIdentifier("ada@example.com");
    });
    expect(result.current.flow.view).toBe("magic_pending");
    expect(result.current.flow.identifier).toBe("ada@example.com");
  });

  it("moves to magic_pending on MAGIC_NEW_DEVICE_PENDING", async () => {
    const { client, result } = await renderAtLogin();
    act(() => client.emit(AUTH_CHANGE_EVENTS.MAGIC_NEW_DEVICE_PENDING));
    expect(result.current.flow.view).toBe("magic_pending");
  });

  it("moves to otp_input on OTP_PENDING and OTP_NEW_DEVICE_PENDING", async () => {
    const client = createFakeClient();
    otpSignIn(client);
    const { result } = await renderAtLogin(client);
    await act(async () => {
      await result.current.flow.submitIdentifier("+15555550100");
    });
    expect(result.current.flow.view).toBe("otp_input");

    act(() => result.current.flow.retry());
    act(() => client.emit(AUTH_CHANGE_EVENTS.OTP_NEW_DEVICE_PENDING));
    expect(result.current.flow.view).toBe("otp_input");
  });

  it("moves to webauthn_verify on WEBAUTHN_VERIFY_START, then authenticated on SIGNED_IN", async () => {
    const client = createFakeClient();
    client.signInOrUp.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.WEBAUTHN_VERIFY_START);
      return { data: null, error: null };
    });
    const { result } = await renderAtLogin(client);
    await act(async () => {
      await result.current.flow.submitIdentifier("ada@example.com");
    });
    expect(result.current.flow.view).toBe("webauthn_verify");
    act(() => client.emitSignedIn());
    expect(result.current.flow.view).toBe("authenticated");
    expect(result.current.flow.user).toEqual(USER);
  });

  it("stores the MFA challenge from an mfaRequired response", async () => {
    const client = createFakeClient();
    client.signInOrUp.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.MFA_REQUIRED);
      return {
        data: { ...mfaRequiredData, mfaGracePeriod: true, mfaGraceDaysRemaining: 7 },
        error: null,
      };
    });
    const { result } = await renderAtLogin(client);
    await act(async () => {
      await result.current.flow.submitIdentifier("ada@example.com");
    });
    expect(result.current.flow.view).toBe("mfa_verify");
    expect(result.current.flow.mfaChallenge).toEqual(mfaRequiredData.mfaChallenge);
    expect(result.current.flow.mfaAvailableMethods).toEqual(["totp", "backup_code"]);
    expect(result.current.flow.mfaGracePeriod).toBe(true);
    expect(result.current.flow.mfaGraceDaysRemaining).toBe(7);
  });
});

describe("magic link polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  async function atMagicPending(client: FakeClient) {
    const r = renderFlow(client);
    await flush();
    expect(r.result.current.flow.view).toBe("login");
    await act(async () => {
      await r.result.current.flow.submitIdentifier("ada@example.com");
    });
    expect(r.result.current.flow.view).toBe("magic_pending");
    return r;
  }

  it("polls getMagicLinkStatus every 2s and signs in with the payload once consumed", async () => {
    const client = createFakeClient();
    magicLinkSignIn(client, "ml_42");
    client.getMagicLinkStatus
      .mockResolvedValueOnce({ data: null, error: { message: "pending" } })
      .mockResolvedValueOnce({ data: null, error: { message: "pending" } })
      .mockResolvedValueOnce({ data: AUTH_PAYLOAD, error: null });
    const { result } = await atMagicPending(client);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(client.getMagicLinkStatus).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(client.getMagicLinkStatus).toHaveBeenCalledTimes(1);
    expect(client.getMagicLinkStatus).toHaveBeenCalledWith("ml_42");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(client.getMagicLinkStatus).toHaveBeenCalledTimes(2);
    expect(result.current.flow.view).toBe("magic_pending");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(client.getMagicLinkStatus).toHaveBeenCalledTimes(3);
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1);
    expect(client.signInWithTokenPayload).toHaveBeenCalledWith(AUTH_PAYLOAD);
    expect(result.current.flow.view).toBe("authenticated");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(client.getMagicLinkStatus).toHaveBeenCalledTimes(3);
  });

  it("does not poll on MAGIC_PENDING until a magic link id is known", async () => {
    const client = createFakeClient();
    const { result } = renderFlow(client);
    await flush();
    act(() => client.emit(AUTH_CHANGE_EVENTS.MAGIC_PENDING));
    expect(result.current.flow.view).toBe("magic_pending");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(client.getMagicLinkStatus).not.toHaveBeenCalled();
  });

  it("stops polling when the user goes back with retry()", async () => {
    const client = createFakeClient();
    magicLinkSignIn(client);
    const { result } = await atMagicPending(client);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(client.getMagicLinkStatus).toHaveBeenCalledTimes(1);
    act(() => result.current.flow.retry());
    expect(result.current.flow.view).toBe("login");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(client.getMagicLinkStatus).toHaveBeenCalledTimes(1);
  });

  it("stops polling on unmount", async () => {
    const client = createFakeClient();
    magicLinkSignIn(client);
    const { unmount } = await atMagicPending(client);
    unmount();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(client.getMagicLinkStatus).not.toHaveBeenCalled();
  });

  it("keeps polling forever while the status call errors", async () => {
    const client = createFakeClient();
    magicLinkSignIn(client);
    await atMagicPending(client);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    // CURRENT BEHAVIOR (suspected bug): no max attempts, no expiry and no
    // backoff. An expired or revoked link is polled every 2s for as long as
    // the tab stays open.
    expect(client.getMagicLinkStatus).toHaveBeenCalledTimes(30);
  });

  it("resumes polling the old magic link id after retry()", async () => {
    const client = createFakeClient();
    magicLinkSignIn(client, "ml_old");
    const { result } = await atMagicPending(client);
    act(() => result.current.flow.retry());
    expect(result.current.flow.identifier).toBe("");
    act(() => client.emit(AUTH_CHANGE_EVENTS.MAGIC_PENDING));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    // CURRENT BEHAVIOR (suspected bug): retry() clears the identifier but
    // not magicLinkId, so the next MAGIC_PENDING polls the previous link
    // (until a new submit replaces the id).
    expect(client.getMagicLinkStatus).toHaveBeenLastCalledWith("ml_old");
  });

  it("can sign in twice when a slow status response overlaps the next tick", async () => {
    const client = createFakeClient();
    magicLinkSignIn(client);
    client.getMagicLinkStatus.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ data: AUTH_PAYLOAD, error: null }), 3000)
        )
    );
    const { result } = await atMagicPending(client);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    // CURRENT BEHAVIOR (suspected bug): ticks are not serialized; a request
    // still in flight when the interval is cleared still calls
    // signInWithTokenPayload when it resolves.
    expect(client.getMagicLinkStatus).toHaveBeenCalledTimes(2);
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(2);
    expect(result.current.flow.view).toBe("authenticated");
  });
});

describe("OTP verification", () => {
  async function atOtpInput(client: FakeClient) {
    otpSignIn(client);
    const r = await renderAtLogin(client);
    await act(async () => {
      await r.result.current.flow.submitIdentifier("ada@example.com");
    });
    expect(r.result.current.flow.view).toBe("otp_input");
    return r;
  }

  it("verifies the code against the submitted identifier and offers a passkey", async () => {
    const client = createFakeClient({
      verifyOtp: vi.fn(async () => ({ data: { authPayload: AUTH_PAYLOAD }, error: null })),
    });
    const { result } = await atOtpInput(client);
    await act(async () => {
      await result.current.flow.submitOtp("123456");
    });
    expect(client.verifyOtp).toHaveBeenCalledWith("123456", "ada@example.com");
    expect(result.current.flow.view).toBe("webauthn_register");
    expect(client.signInWithTokenPayload).not.toHaveBeenCalled();
  });

  it("signs in directly when passkeys are disabled", async () => {
    const client = createFakeClient({
      verifyOtp: vi.fn(async () => ({ data: { authPayload: AUTH_PAYLOAD }, error: null })),
      getAppData: vi.fn(async () => ({ data: { passkeys_enabled: false }, error: null })),
    });
    const { result } = await atOtpInput(client);
    await act(async () => {
      await result.current.flow.submitOtp("123456");
    });
    expect(client.signInWithTokenPayload).toHaveBeenCalledWith(AUTH_PAYLOAD);
    expect(result.current.flow.view).toBe("authenticated");
  });

  it("offers a passkey when app data fails to load", async () => {
    const client = createFakeClient({
      verifyOtp: vi.fn(async () => ({ data: { authPayload: AUTH_PAYLOAD }, error: null })),
      getAppData: vi.fn(async () => ({ data: null, error: { message: "503" } })),
    });
    const { result } = await atOtpInput(client);
    await act(async () => {
      await result.current.flow.submitOtp("123456");
    });
    // CURRENT BEHAVIOR (suspected bug): same `!== false` fail-open as the
    // magic link path (SEC-40).
    expect(result.current.flow.view).toBe("webauthn_register");
  });

  it("shows the verify error and stays on the code screen", async () => {
    const client = createFakeClient({
      verifyOtp: vi.fn(async () => ({ data: null, error: { message: "Invalid OTP" } })),
    });
    const { result } = await atOtpInput(client);
    await act(async () => {
      await result.current.flow.submitOtp("000000");
    });
    expect(result.current.flow.error).toBe("Invalid OTP");
    expect(result.current.flow.view).toBe("otp_input");
  });

  it("reports thrown errors with an 'Invalid code' fallback", async () => {
    const client = createFakeClient({ verifyOtp: vi.fn(async () => Promise.reject({})) });
    const { result } = await atOtpInput(client);
    await act(async () => {
      await result.current.flow.submitOtp("000000");
    });
    expect(result.current.flow.error).toBe("Invalid code");
  });

  it("stores the MFA challenge but not the grace-period fields", async () => {
    const client = createFakeClient();
    client.verifyOtp.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_REQUIRED);
      return {
        data: { ...mfaRequiredData, mfaGracePeriod: true, mfaGraceDaysRemaining: 4 },
        error: null,
      };
    });
    const { result } = await atOtpInput(client);
    await act(async () => {
      await result.current.flow.submitOtp("123456");
    });
    expect(result.current.flow.view).toBe("mfa_enroll");
    expect(result.current.flow.mfaChallenge).toEqual(mfaRequiredData.mfaChallenge);
    expect(result.current.flow.mfaAvailableMethods).toEqual(["totp", "backup_code"]);
    // CURRENT BEHAVIOR (suspected bug): submitOtp copies MFA fields by hand
    // instead of using handleMfaResponse, so grace-period info is dropped on
    // the OTP path only (REF-16).
    expect(result.current.flow.mfaGracePeriod).toBe(false);
    expect(result.current.flow.mfaGraceDaysRemaining).toBeUndefined();
  });
});

describe("passkey registration offer", () => {
  it("ignores SIGNED_IN while the registration offer is showing", async () => {
    const { client, result } = await renderAtRegister();
    act(() => client.emitSignedIn());
    expect(result.current.flow.view).toBe("webauthn_register");
    expect(result.current.auth.isAuthenticated).toBe(true);
  });

  it("registerPasskey signs in with the stored payload, adds the device, then authenticates", async () => {
    const { client, result } = await renderAtRegister();
    vi.useFakeTimers();
    await act(async () => {
      await result.current.flow.registerPasskey();
    });
    expect(client.signInWithTokenPayload).toHaveBeenCalledWith(AUTH_PAYLOAD);
    expect(client.addDevice).toHaveBeenCalledWith();
    expect(client.signInWithTokenPayload.mock.invocationCallOrder[0]).toBeLessThan(
      client.addDevice.mock.invocationCallOrder[0]
    );
    expect(result.current.flow.view).toBe("webauthn_register_success");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(799);
    });
    expect(result.current.flow.view).toBe("webauthn_register_success");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.flow.view).toBe("authenticated");
    expect(result.current.flow.isAuthenticated).toBe(true);
  });

  it("registerPasskey moves to the MFA enrollment suggestion when the server suggested one", async () => {
    const client = createFakeClient();
    const { result } = await renderAtRegister(client);
    client.pendingMfaEnrollmentSuggestion = {
      available_methods: ["totp", "sms"],
      mfa_grace_days_remaining: 5,
    };
    vi.useFakeTimers();
    await act(async () => {
      await result.current.flow.registerPasskey();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(result.current.flow.view).toBe("mfa_enroll_suggest");
    expect(result.current.flow.mfaAvailableMethods).toEqual(["totp", "sms"]);
    expect(result.current.flow.mfaGracePeriod).toBe(true);
    expect(result.current.flow.mfaGraceDaysRemaining).toBe(5);

    act(() => result.current.flow.skipMfaEnrollment());
    expect(result.current.flow.view).toBe("authenticated");
  });

  it("registerPasskey stops before addDevice when the sign-in fails", async () => {
    const { client, result } = await renderAtRegister();
    client.signInWithTokenPayload.mockResolvedValueOnce({ error: { message: "Session rejected" } });
    await act(async () => {
      await result.current.flow.registerPasskey();
    });
    expect(result.current.flow.error).toBe("Session rejected");
    expect(client.addDevice).not.toHaveBeenCalled();
    expect(result.current.flow.view).toBe("webauthn_register");
  });

  it("registerPasskey leaves a signed-in user on the offer when addDevice fails", async () => {
    const { client, result } = await renderAtRegister();
    client.addDevice.mockResolvedValueOnce({ data: null, error: { message: "The operation was cancelled" } });
    await act(async () => {
      await result.current.flow.registerPasskey();
    });
    expect(result.current.flow.error).toBe("The operation was cancelled");
    // CURRENT BEHAVIOR (suspected bug): the session is already live (the
    // SIGNED_IN was swallowed by the register view), so the user is signed in
    // but parked on the registration offer. Skip does not get them out
    // either (see skipPasskey below).
    expect(result.current.flow.view).toBe("webauthn_register");
    expect(result.current.auth.isAuthenticated).toBe(true);
  });

  it("registerPasskey reports thrown errors with a fallback message", async () => {
    const { client, result } = await renderAtRegister();
    client.addDevice.mockRejectedValueOnce({});
    await act(async () => {
      await result.current.flow.registerPasskey();
    });
    expect(result.current.flow.error).toBe("Failed to register passkey");
  });

  it("skipPasskey signs in without adding a device but never leaves the offer", async () => {
    const { client, result } = await renderAtRegister();
    await act(async () => {
      await result.current.flow.skipPasskey();
    });
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1);
    expect(client.signInWithTokenPayload).toHaveBeenCalledWith(AUTH_PAYLOAD);
    expect(client.addDevice).not.toHaveBeenCalled();
    // CURRENT BEHAVIOR (suspected bug): skipPasskey returns right after the
    // sign-in and relies on SIGNED_IN to move on, but the listener ignores
    // SIGNED_IN in "webauthn_register" and the isAuthenticated effect also
    // excludes it. The user is signed in yet stuck on "Register a passkey".
    expect(result.current.flow.view).toBe("webauthn_register");
    expect(result.current.flow.isAuthenticated).toBe(true);
    expect(result.current.auth.isAuthenticated).toBe(true);
  });

  it("skipPasskey swallows a returned sign-in error", async () => {
    const { client, result } = await renderAtRegister();
    client.signInWithTokenPayload.mockResolvedValueOnce({ error: { message: "Session rejected" } });
    await act(async () => {
      await result.current.flow.skipPasskey();
    });
    // CURRENT BEHAVIOR (suspected bug): the { error } result is ignored, so
    // nothing tells the user why "Skip for now" did nothing.
    expect(result.current.flow.error).toBeNull();
    expect(result.current.flow.view).toBe("webauthn_register");
  });
});

describe("MFA views", () => {
  async function atMfaVerify(client: FakeClient) {
    client.signInOrUp.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.MFA_REQUIRED);
      return { data: mfaRequiredData, error: null };
    });
    const r = await renderAtLogin(client);
    await act(async () => {
      await r.result.current.flow.submitIdentifier("ada@example.com");
    });
    expect(r.result.current.flow.view).toBe("mfa_verify");
    return r;
  }

  it.each([
    [AUTH_CHANGE_EVENTS.MFA_REQUIRED, "mfa_verify"],
    [AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_REQUIRED, "mfa_enroll"],
    [AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_SUGGESTED, "mfa_enroll_suggest"],
  ])("%s moves to %s", async (event, view) => {
    const { client, result } = await renderAtLogin();
    act(() => client.emit(event));
    expect(result.current.flow.view).toBe(view);
  });

  it("submitMfaCode verifies against the stored challenge token and authenticates", async () => {
    const client = createFakeClient();
    // Real client shape: verifyMfaChallenge signs in itself and returns { error: null }.
    client.verifyMfaChallenge.mockImplementation(async () => {
      client.emitSignedIn();
      return { error: null };
    });
    const { result } = await atMfaVerify(client);
    await act(async () => {
      await result.current.flow.submitMfaCode("246810");
    });
    expect(client.verifyMfaChallenge).toHaveBeenCalledWith("chl_mfa_1", "246810");
    expect(client.signInWithTokenPayload).not.toHaveBeenCalled();
    expect(result.current.flow.view).toBe("authenticated");
    expect(result.current.auth.isAuthenticated).toBe(true);
  });

  it("submitMfaCode signs in itself if the client returns an authPayload", async () => {
    const client = createFakeClient({
      verifyMfaChallenge: vi.fn(async () => ({ data: { authPayload: AUTH_PAYLOAD }, error: null })),
    });
    const { result } = await atMfaVerify(client);
    await act(async () => {
      await result.current.flow.submitMfaCode("246810");
    });
    expect(client.signInWithTokenPayload).toHaveBeenCalledWith(AUTH_PAYLOAD);
    expect(result.current.flow.view).toBe("authenticated");
  });

  it("submitMfaCode shows the error and stays on mfa_verify", async () => {
    const client = createFakeClient({
      verifyMfaChallenge: vi.fn(async () => ({ data: null, error: { message: "Invalid code" } })),
    });
    const { result } = await atMfaVerify(client);
    await act(async () => {
      await result.current.flow.submitMfaCode("000000");
    });
    expect(result.current.flow.error).toBe("Invalid code");
    expect(result.current.flow.view).toBe("mfa_verify");
  });

  it("submitMfaCode reports thrown errors with a fallback message", async () => {
    const client = createFakeClient({ verifyMfaChallenge: vi.fn(() => Promise.reject({})) });
    const { result } = await atMfaVerify(client);
    await act(async () => {
      await result.current.flow.submitMfaCode("000000");
    });
    expect(result.current.flow.error).toBe("MFA verification failed");
  });

  it("submitMfaCode is a silent no-op with no stored challenge", async () => {
    const { client, result } = await renderAtLogin();
    act(() => client.emit(AUTH_CHANGE_EVENTS.MFA_REQUIRED));
    await act(async () => {
      await result.current.flow.submitMfaCode("123456");
    });
    expect(client.verifyMfaChallenge).not.toHaveBeenCalled();
    expect(result.current.flow.error).toBeNull();
    expect(result.current.flow.view).toBe("mfa_verify");
  });
});

describe("retry and signOut", () => {
  it("retry clears the error and identifier and returns to login", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      verifyMagicLinkToken: vi.fn(async () => ({ data: null, error: { message: "Link expired" } })),
    });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("error"));
    act(() => result.current.flow.setIdentifier("ada@example.com"));
    act(() => result.current.flow.retry());
    expect(result.current.flow.view).toBe("login");
    expect(result.current.flow.error).toBeNull();
    expect(result.current.flow.identifier).toBe("");
  });

  it("signOut is the AuthContext signOut and calls the client", async () => {
    const { client, result } = await renderAtLogin();
    act(() => client.emitSignedIn());
    await act(async () => {
      await result.current.flow.signOut();
    });
    expect(client.signOut).toHaveBeenCalledTimes(1);
  });
});

describe("security", () => {
  it("keeps reporting authenticated after SIGNED_OUT", async () => {
    const { client, result } = await renderAtLogin();
    act(() => client.emitSignedIn());
    expect(result.current.flow.view).toBe("authenticated");
    await act(async () => {
      await result.current.flow.signOut();
    });
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.flow.user).toBeNull();
    // CURRENT BEHAVIOR (suspected bug): nothing handles SIGNED_OUT and the
    // isAuthenticated effect only ever moves *to* "authenticated", so the
    // view stays "authenticated" and `isAuthenticated: isAuthenticated ||
    // view === "authenticated"` stays true after sign-out.
    expect(result.current.flow.view).toBe("authenticated");
    expect(result.current.flow.isAuthenticated).toBe(true);
  });

  it("keeps reporting authenticated after SESSION_EXPIRED", async () => {
    const { client, result } = await renderAtLogin();
    act(() => client.emitSignedIn());
    act(() => client.emit(AUTH_CHANGE_EVENTS.SESSION_EXPIRED));
    expect(result.current.auth.isAuthenticated).toBe(false);
    // CURRENT BEHAVIOR (suspected bug): same as SIGNED_OUT; an expired
    // session does not close the flow.
    expect(result.current.flow.view).toBe("authenticated");
    expect(result.current.flow.isAuthenticated).toBe(true);
  });

  it("treats MFA_VERIFIED as authenticated without checking for a session", async () => {
    const { client, result } = await renderAtLogin();
    act(() => client.emit(AUTH_CHANGE_EVENTS.MFA_VERIFIED));
    // CURRENT BEHAVIOR (suspected bug): the event name alone flips the view;
    // no session exists (the core never emits MFA_VERIFIED today, so this is
    // latent).
    expect(result.current.flow.view).toBe("authenticated");
    expect(result.current.flow.isAuthenticated).toBe(true);
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.flow.user).toBeNull();
  });

  it("skipMfaEnrollment during mandatory enrollment reports authenticated with no session", async () => {
    const { client, result } = await renderAtLogin();
    act(() => client.emit(AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_REQUIRED));
    expect(result.current.flow.view).toBe("mfa_enroll");
    act(() => result.current.flow.skipMfaEnrollment());
    // CURRENT BEHAVIOR (suspected bug): skipMfaEnrollment is meant for the
    // optional suggestion, but it works in the required-enrollment view too
    // and flips the client-side gate open without any session.
    expect(result.current.flow.view).toBe("authenticated");
    expect(result.current.flow.isAuthenticated).toBe(true);
    expect(result.current.auth.isAuthenticated).toBe(false);
  });

  it("skipPasskey reports authenticated with no session when the sign-in throws", async () => {
    const { client, result } = await renderAtRegister();
    client.signInWithTokenPayload.mockRejectedValueOnce(new Error("storage unavailable"));
    await act(async () => {
      await result.current.flow.skipPasskey();
    });
    // CURRENT BEHAVIOR (suspected bug): the catch swallows the failure and
    // falls through to setView("authenticated"), failing open.
    expect(result.current.flow.view).toBe("authenticated");
    expect(result.current.flow.isAuthenticated).toBe(true);
    expect(result.current.auth.isAuthenticated).toBe(false);
  });

  it("never exposes auth tokens or the magic token in the hook's return value", async () => {
    const { result } = await renderAtRegister();
    const serialized = JSON.stringify(result.current.flow);
    expect(serialized).not.toContain(ACCESS_TOKEN);
    expect(serialized).not.toContain(REFRESH_TOKEN);
    expect(serialized).not.toContain(MAGIC_TOKEN);
    expect(Object.keys(result.current.flow)).not.toContain("authPayload");
  });

  it("never logs tokens during a full magic link + passkey flow", async () => {
    const spies = (["log", "info", "debug", "warn", "error"] as const).map((m) =>
      vi.spyOn(console, m)
    );
    const { result } = await renderAtRegister();
    await act(async () => {
      await result.current.flow.registerPasskey();
    });
    for (const spy of spies) {
      for (const args of spy.mock.calls) {
        const text = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
        expect(text).not.toContain(ACCESS_TOKEN);
        expect(text).not.toContain(REFRESH_TOKEN);
        expect(text).not.toContain(MAGIC_TOKEN);
      }
    }
  });
});
