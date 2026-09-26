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
 *   6. sct_sk=true -> skip passkey, sign in directly (read before the URL scrub)
 *   7. registerPasskey -> signInWithTokenPayload + addDevice -> success -> authenticated
 *   8. skipPasskey -> signInWithTokenPayload only -> "authenticated"
 *   9. OTP_PENDING -> "otp_input"; WEBAUTHN_VERIFY_START -> "webauthn_verify"
 *  10. SIGNED_IN -> "authenticated" unless in the register flow
 *  11. magic link polling every 2s while pending, stops on success or after 10 minutes
 *  12. retry resets to login
 *  13. URL cleanup after magic verify
 *  14. SIGNED_OUT / SESSION_EXPIRED -> back to "login"
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
    // Known limitation, tracked separately: the init effect reads isAuthenticated from the first render, so a SIGNED_IN that lands before _initialize() resolves is replaced by "login".
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
    // Signed in before the offer: server-side sign-in only accepts a freshly
    // issued token, so the payload is exchanged at once, not on click.
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1);
    expect(client.signInWithTokenPayload).toHaveBeenCalledWith(AUTH_PAYLOAD);
    expect(result.current.auth.isAuthenticated).toBe(true);
    // The offer stays up; SIGNED_IN during the exchange doesn't move past it.
    expect(result.current.flow.view).toBe("webauthn_register");
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
    await waitFor(() => expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1));
    expect(result.current.flow.view).toBe("webauthn_register");
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

  it("signs in directly when passkeys_enabled is missing from app data (fails closed, SEC-40)", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      getAppData: vi.fn(async () => ({ data: { name: "App" }, error: null })),
    });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("authenticated"));
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1);
    expect(client.signInWithTokenPayload).toHaveBeenCalledWith(AUTH_PAYLOAD);
  });

  it("signs in directly when app data fails to load (fails closed, SEC-40)", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      getAppData: vi.fn(async () => ({ data: null, error: { message: "503" } })),
    });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("authenticated"));
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1);
    expect(client.signInWithTokenPayload).toHaveBeenCalledWith(AUTH_PAYLOAD);
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

  it("sends one request for two submits in the same tick", async () => {
    const { client, result } = await renderAtLogin();
    const submit = result.current.flow.submitIdentifier;
    await act(async () => {
      await Promise.all([submit("ada@example.com"), submit("ada@example.com")]);
    });
    expect(client.signInOrUp).toHaveBeenCalledTimes(1);
    // The guard is released once the request settles.
    await act(async () => {
      await result.current.flow.submitIdentifier("ada@example.com");
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

  it("stops polling after 10 minutes and shows an error", async () => {
    const client = createFakeClient();
    magicLinkSignIn(client);
    const { result } = await atMagicPending(client);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(client.getMagicLinkStatus).toHaveBeenCalledTimes(30);
    expect(result.current.flow.view).toBe("magic_pending");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9 * 60_000);
    });
    const calls = client.getMagicLinkStatus.mock.calls.length;
    expect(calls).toBeLessThanOrEqual(300);
    expect(result.current.flow.view).toBe("error");
    expect(result.current.flow.error).toBe("The sign-in link timed out. Please try again.");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(client.getMagicLinkStatus).toHaveBeenCalledTimes(calls);
    expect(client.signInWithTokenPayload).not.toHaveBeenCalled();
  });

  it("keeps polling after a status request throws", async () => {
    const client = createFakeClient();
    magicLinkSignIn(client);
    client.getMagicLinkStatus
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ data: AUTH_PAYLOAD, error: null });
    const { result } = await atMagicPending(client);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(client.getMagicLinkStatus).toHaveBeenCalledTimes(2);
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1);
    expect(result.current.flow.view).toBe("authenticated");
  });

  it("retry() forgets the magic link id, so a later MAGIC_PENDING does not poll the old link", async () => {
    const client = createFakeClient();
    magicLinkSignIn(client, "ml_old");
    const { result } = await atMagicPending(client);
    act(() => result.current.flow.retry());
    expect(result.current.flow.identifier).toBe("");
    act(() => client.emit(AUTH_CHANGE_EVENTS.MAGIC_PENDING));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(client.getMagicLinkStatus).not.toHaveBeenCalled();
  });

  it("waits for a slow status response instead of overlapping, and signs in once", async () => {
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
    expect(client.getMagicLinkStatus).toHaveBeenCalledTimes(1);
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1);
    expect(result.current.flow.view).toBe("authenticated");
  });

  it("does not sign in from a status response that arrives after the user went back", async () => {
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
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(client.getMagicLinkStatus).toHaveBeenCalledTimes(1);
    act(() => result.current.flow.retry());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(client.signInWithTokenPayload).not.toHaveBeenCalled();
    expect(result.current.flow.view).toBe("login");
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
    // Exchanged right away, before the offer (fresh-token sign-in).
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1);
    expect(result.current.auth.isAuthenticated).toBe(true);
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

  it.each([
    ["app data fails to load", { data: null, error: { message: "503" } }],
    ["passkeys_enabled is missing", { data: { name: "App" }, error: null }],
  ])("signs in directly when %s (fails closed, SEC-40)", async (_label, appData) => {
    const client = createFakeClient({
      verifyOtp: vi.fn(async () => ({ data: { authPayload: AUTH_PAYLOAD }, error: null })),
      getAppData: vi.fn(async () => appData),
    });
    const { result } = await atOtpInput(client);
    await act(async () => {
      await result.current.flow.submitOtp("123456");
    });
    expect(client.signInWithTokenPayload).toHaveBeenCalledWith(AUTH_PAYLOAD);
    expect(result.current.flow.view).toBe("authenticated");
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
    // Known limitation, tracked separately (REF-16): submitOtp copies the MFA fields by hand, so the grace-period fields are not stored on the OTP path.
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

  it("shows a failed sign-in on the offer; registerPasskey retries it and stops before addDevice if it fails again", async () => {
    const client = createFakeClient();
    client.signInWithTokenPayload.mockResolvedValueOnce({ error: { message: "Session rejected" } });
    const { result } = await renderAtRegister(client);
    await waitFor(() => expect(result.current.flow.error).toBe("Session rejected"));
    expect(result.current.flow.isAuthenticated).toBe(false);

    client.signInWithTokenPayload.mockResolvedValueOnce({ error: { message: "Still rejected" } });
    await act(async () => {
      await result.current.flow.registerPasskey();
    });
    expect(result.current.flow.error).toBe("Still rejected");
    expect(client.addDevice).not.toHaveBeenCalled();
    expect(result.current.flow.view).toBe("webauthn_register");

    await act(async () => {
      await result.current.flow.registerPasskey();
    });
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(3);
    expect(client.addDevice).toHaveBeenCalledTimes(1);
    expect(result.current.flow.view).toBe("webauthn_register_success");
  });

  it("registerPasskey shows an addDevice error and the signed-in user can still skip to authenticated", async () => {
    const { client, result } = await renderAtRegister();
    client.addDevice.mockResolvedValueOnce({ data: null, error: { message: "The operation was cancelled" } });
    await act(async () => {
      await result.current.flow.registerPasskey();
    });
    expect(result.current.flow.error).toBe("The operation was cancelled");
    expect(result.current.flow.view).toBe("webauthn_register");
    expect(result.current.auth.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.flow.skipPasskey();
    });
    expect(result.current.flow.view).toBe("authenticated");
    expect(result.current.flow.error).toBeNull();
    expect(result.current.flow.isAuthenticated).toBe(true);
    // The payload was already exchanged for a session; skip does not sign in again.
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1);
  });

  it("registerPasskey retried after an addDevice failure does not sign in again", async () => {
    const { client, result } = await renderAtRegister();
    client.addDevice.mockResolvedValueOnce({ data: null, error: { message: "The operation was cancelled" } });
    await act(async () => {
      await result.current.flow.registerPasskey();
    });
    await act(async () => {
      await result.current.flow.registerPasskey();
    });
    expect(client.addDevice).toHaveBeenCalledTimes(2);
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1);
    expect(result.current.flow.view).toBe("webauthn_register_success");
    expect(result.current.flow.error).toBeNull();
  });

  it("registerPasskey reports thrown errors with a fallback message", async () => {
    const { client, result } = await renderAtRegister();
    client.addDevice.mockRejectedValueOnce({});
    await act(async () => {
      await result.current.flow.registerPasskey();
    });
    expect(result.current.flow.error).toBe("Failed to register passkey");
  });

  it("skipPasskey signs in without adding a device and moves to authenticated", async () => {
    const { client, result } = await renderAtRegister();
    await act(async () => {
      await result.current.flow.skipPasskey();
    });
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1);
    expect(client.signInWithTokenPayload).toHaveBeenCalledWith(AUTH_PAYLOAD);
    expect(client.addDevice).not.toHaveBeenCalled();
    expect(result.current.flow.view).toBe("authenticated");
    expect(result.current.flow.isAuthenticated).toBe(true);
    expect(result.current.auth.isAuthenticated).toBe(true);
  });

  it("skipPasskey shows a returned sign-in error and stays on the offer", async () => {
    const client = createFakeClient();
    client.signInWithTokenPayload
      .mockResolvedValueOnce({ error: { message: "Session rejected" } })
      .mockResolvedValueOnce({ error: { message: "Session rejected" } });
    const { result } = await renderAtRegister(client);
    await act(async () => {
      await result.current.flow.skipPasskey();
    });
    expect(result.current.flow.error).toBe("Session rejected");
    expect(result.current.flow.view).toBe("webauthn_register");
    expect(result.current.flow.isAuthenticated).toBe(false);

    // A later successful skip continues.
    await act(async () => {
      await result.current.flow.skipPasskey();
    });
    expect(result.current.flow.view).toBe("authenticated");
    expect(result.current.flow.error).toBeNull();
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

  it("submitMfaCode leaves the sign-in to verifyMfaChallenge (it signs in on success)", async () => {
    const client = createFakeClient();
    // The real client's verifyMfaChallenge signs in and returns { error: null }.
    client.verifyMfaChallenge = vi.fn(async () => {
      await client.signInWithTokenPayload(AUTH_PAYLOAD);
      return { error: null };
    }) as any;
    const { result } = await atMfaVerify(client);
    await act(async () => {
      await result.current.flow.submitMfaCode("246810");
    });
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1);
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
  it("returns to login and reports signed out after SIGNED_OUT", async () => {
    const { client, result } = await renderAtLogin();
    act(() => client.emitSignedIn());
    expect(result.current.flow.view).toBe("authenticated");
    await act(async () => {
      await result.current.flow.signOut();
    });
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.flow.user).toBeNull();
    expect(result.current.flow.view).toBe("login");
    expect(result.current.flow.isAuthenticated).toBe(false);
  });

  it("returns to login and reports signed out after SESSION_EXPIRED", async () => {
    const { client, result } = await renderAtLogin();
    act(() => client.emitSignedIn());
    act(() => client.emit(AUTH_CHANGE_EVENTS.SESSION_EXPIRED));
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.flow.view).toBe("login");
    expect(result.current.flow.isAuthenticated).toBe(false);
  });

  it("clears the MFA state on SIGNED_OUT", async () => {
    const client = createFakeClient();
    client.signInOrUp.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.MFA_REQUIRED);
      return { data: { ...mfaRequiredData, mfaGracePeriod: true, mfaGraceDaysRemaining: 2 }, error: null };
    });
    const { result } = await renderAtLogin(client);
    await act(async () => {
      await result.current.flow.submitIdentifier("ada@example.com");
    });
    expect(result.current.flow.mfaChallenge).toEqual(mfaRequiredData.mfaChallenge);
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_OUT));
    expect(result.current.flow.view).toBe("login");
    expect(result.current.flow.mfaChallenge).toBeNull();
    expect(result.current.flow.mfaAvailableMethods).toEqual([]);
    expect(result.current.flow.mfaGracePeriod).toBe(false);
    expect(result.current.flow.mfaGraceDaysRemaining).toBeUndefined();
    expect(result.current.flow.identifier).toBe("");
  });

  it("forgets the stored auth payload on SIGNED_OUT during the passkey offer", async () => {
    const { client, result } = await renderAtRegister();
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_OUT));
    expect(result.current.flow.view).toBe("login");
    // Nothing is left to sign in with.
    await act(async () => {
      await result.current.flow.skipPasskey();
    });
    // Only the exchange before the offer; nothing is left to sign in with.
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1);
    expect(result.current.flow.view).toBe("login");
    expect(result.current.flow.isAuthenticated).toBe(false);
  });

  it("SESSION_EXPIRED for a stale session does not drop a sign-in in progress", async () => {
    const client = createFakeClient();
    const exchange = deferred<void>();
    const signIn = client.signInWithTokenPayload.getMockImplementation()!;
    client.signInWithTokenPayload.mockImplementationOnce(async (p: any) => {
      await exchange.promise;
      return signIn(p);
    });
    const { result } = await renderAtRegister(client);
    // The exchange hasn't finished, so there's no session in this flow yet:
    // the expiry is about an earlier visit's session.
    act(() => client.emit(AUTH_CHANGE_EVENTS.SESSION_EXPIRED));
    expect(result.current.flow.view).toBe("webauthn_register");
    await act(async () => exchange.resolve());
    await waitFor(() => expect(result.current.auth.isAuthenticated).toBe(true));
    await act(async () => {
      await result.current.flow.skipPasskey();
    });
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1);
    expect(result.current.flow.view).toBe("authenticated");
  });

  it("SESSION_EXPIRED after the passkey offer signed in returns to login", async () => {
    const { client, result } = await renderAtRegister();
    client.addDevice.mockResolvedValueOnce({ data: null, error: { message: "The operation was cancelled" } });
    await act(async () => {
      await result.current.flow.registerPasskey();
    });
    expect(result.current.auth.isAuthenticated).toBe(true);
    act(() => client.emit(AUTH_CHANGE_EVENTS.SESSION_EXPIRED));
    expect(result.current.flow.view).toBe("login");
    await act(async () => {
      await result.current.flow.skipPasskey();
    });
    expect(result.current.flow.view).toBe("login");
    expect(client.signInWithTokenPayload).toHaveBeenCalledTimes(1);
  });

  it("leaves authenticated when a session event reports no session", async () => {
    const { client, result } = await renderAtLogin();
    act(() => client.emitSignedIn());
    expect(result.current.flow.view).toBe("authenticated");
    act(() => client.emit(AUTH_CHANGE_EVENTS.SESSION_REFETCH));
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.flow.view).toBe("login");
    expect(result.current.flow.isAuthenticated).toBe(false);
  });

  it("SIGNED_OUT on the passkey success screen cancels the pending move to authenticated", async () => {
    const { client, result } = await renderAtRegister();
    vi.useFakeTimers();
    await act(async () => {
      await result.current.flow.registerPasskey();
    });
    expect(result.current.flow.view).toBe("webauthn_register_success");
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_OUT));
    expect(result.current.flow.view).toBe("login");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.flow.view).toBe("login");
  });

  it("ignores MFA_VERIFIED when there is no session", async () => {
    const { client, result } = await renderAtLogin();
    act(() => client.emit(AUTH_CHANGE_EVENTS.MFA_REQUIRED));
    act(() => client.emit(AUTH_CHANGE_EVENTS.MFA_VERIFIED));
    expect(result.current.flow.view).toBe("mfa_verify");
    expect(result.current.flow.isAuthenticated).toBe(false);
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.flow.user).toBeNull();
    // SIGNED_IN, which carries the session, moves the flow on.
    act(() => client.emitSignedIn());
    expect(result.current.flow.view).toBe("authenticated");
  });

  it("MFA_VERIFIED returns a signed-in user to authenticated after a step-up", async () => {
    const { client, result } = await renderAtLogin();
    act(() => client.emitSignedIn());
    act(() => client.emit(AUTH_CHANGE_EVENTS.MFA_REQUIRED));
    expect(result.current.flow.view).toBe("mfa_verify");
    act(() => client.emit(AUTH_CHANGE_EVENTS.MFA_VERIFIED));
    expect(result.current.flow.view).toBe("authenticated");
    expect(result.current.flow.isAuthenticated).toBe(true);
  });

  it("skipMfaEnrollment is ignored during mandatory enrollment", async () => {
    const { client, result } = await renderAtLogin();
    act(() => client.emit(AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_REQUIRED));
    expect(result.current.flow.view).toBe("mfa_enroll");
    act(() => result.current.flow.skipMfaEnrollment());
    expect(result.current.flow.view).toBe("mfa_enroll");
    expect(result.current.flow.isAuthenticated).toBe(false);
    expect(result.current.auth.isAuthenticated).toBe(false);
  });

  it("skipPasskey shows a thrown sign-in error and does not authenticate", async () => {
    const client = createFakeClient();
    client.signInWithTokenPayload
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockRejectedValueOnce(new Error("storage unavailable"));
    const { result } = await renderAtRegister(client);
    await waitFor(() => expect(result.current.flow.error).toBe("storage unavailable"));
    await act(async () => {
      await result.current.flow.skipPasskey();
    });
    expect(result.current.flow.view).toBe("webauthn_register");
    expect(result.current.flow.error).toBe("storage unavailable");
    expect(result.current.flow.isAuthenticated).toBe(false);
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
