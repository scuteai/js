/**
 * useScuteAuthFlow: what ScuteSignIn added. Resend with a cooldown,
 * attack protection's code step on a magic link, no passkey offer where
 * the browser can't make one, sign-in refusal codes, the passkey prompt
 * fallback, and the MFA resend / switch / grace paths.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@scute/react-hooks";
import { RESEND_COOLDOWN_SECONDS, useScuteAuthFlow } from "../useScuteAuthFlow";
import {
  AUTH_CHANGE_EVENTS,
  AUTH_PAYLOAD,
  MAGIC_TOKEN,
  createFakeClient,
  flush,
  makeWrapper,
  setUrl,
  type FakeClient,
} from "./fakeScuteClient";

function renderFlow(client: FakeClient = createFakeClient()) {
  const rendered = renderHook(() => ({ flow: useScuteAuthFlow(), auth: useAuth() }), {
    wrapper: makeWrapper(client),
  });
  return { client, ...rendered };
}

async function renderAtLogin(client: FakeClient = createFakeClient()) {
  const r = renderFlow(client);
  await waitFor(() => expect(r.result.current.flow.view).toBe("login"));
  return r;
}

function magicLinkSignIn(client: FakeClient, id = "ml_1") {
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

const VERIFICATION = { token: "sv_tok", method: "email_otp", expires_at: "2030-01-01T00:00:00Z" };
const verificationRequired = (verification: unknown = VERIFICATION) => ({
  data: { verificationRequired: true, verification, reason: "security_verification", threats: ["new_device"] },
  error: null,
});

beforeEach(() => {
  setUrl("/");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setUrl("/");
});

describe("resend", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  async function atPending(client: FakeClient) {
    const r = renderFlow(client);
    await flush();
    await act(async () => {
      await r.result.current.flow.submitIdentifier("ada@example.com");
    });
    return r;
  }

  it("waits 30s after the first link, then sends a new one to the same address and polls it", async () => {
    const client = createFakeClient();
    magicLinkSignIn(client, "ml_first");
    const { result } = await atPending(client);
    expect(result.current.flow.view).toBe("magic_pending");
    expect(result.current.flow.resendIn).toBe(RESEND_COOLDOWN_SECONDS);

    // Too early: nothing is sent.
    await act(async () => {
      await result.current.flow.resend();
    });
    expect(client.sendLoginMagicLink).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.flow.resendIn).toBe(20);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(result.current.flow.resendIn).toBe(0);

    client.getMagicLinkStatus.mockClear();
    let failure: string | null = "unset";
    await act(async () => {
      failure = await result.current.flow.resend();
    });
    expect(failure).toBeNull();
    expect(client.sendLoginMagicLink).toHaveBeenCalledWith("ada@example.com", undefined, false);
    expect(result.current.flow.resent).toBe(true);
    expect(result.current.flow.resendIn).toBe(RESEND_COOLDOWN_SECONDS);
    expect(result.current.flow.view).toBe("magic_pending");

    // The poll follows the new link.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(client.getMagicLinkStatus).toHaveBeenLastCalledWith("ml_resent");
  });

  it("sends a new code without a pending event, and a refused send restarts the wait too", async () => {
    const client = createFakeClient();
    otpSignIn(client);
    const { result } = await atPending(client);
    expect(result.current.flow.view).toBe("otp_input");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESEND_COOLDOWN_SECONDS * 1000);
    });
    client.sendLoginOtp.mockResolvedValueOnce({ data: null, error: { message: "Rate limit exceeded" } });
    let failure: string | null = null;
    await act(async () => {
      failure = await result.current.flow.resend();
    });
    expect(client.sendLoginOtp).toHaveBeenCalledWith("ada@example.com", undefined, false);
    expect(failure).toBe("Rate limit exceeded");
    expect(result.current.flow.resendError).toBe("Rate limit exceeded");
    expect(result.current.flow.resent).toBe(false);
    expect(result.current.flow.resendIn).toBe(RESEND_COOLDOWN_SECONDS);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESEND_COOLDOWN_SECONDS * 1000);
    });
    await act(async () => {
      await result.current.flow.resend();
    });
    expect(client.sendLoginOtp).toHaveBeenCalledTimes(2);
    expect(result.current.flow.resent).toBe(true);
    expect(result.current.flow.resendError).toBeNull();
  });

  it("does nothing outside the link and code steps", async () => {
    const client = createFakeClient();
    const r = renderFlow(client);
    await flush();
    await act(async () => {
      await r.result.current.flow.resend();
    });
    expect(client.sendLoginMagicLink).not.toHaveBeenCalled();
    expect(client.sendLoginOtp).not.toHaveBeenCalled();
  });
});

describe("attack protection's code step on a magic link", () => {
  it("shows verification_required, then the code signs in through the same link", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      verifyMagicLinkToken: vi.fn(async () => verificationRequired()),
    });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("verification_required"));
    expect(result.current.flow.verification).toEqual(VERIFICATION);
    expect(client.signInWithTokenPayload).not.toHaveBeenCalled();
    // The token is scrubbed from the URL even though the link isn't done.
    expect(window.location.search).not.toContain(MAGIC_TOKEN);

    let ok = false;
    await act(async () => {
      ok = await result.current.flow.submitVerificationCode("123456");
    });
    expect(ok).toBe(true);
    expect(client.verifySignInVerification).toHaveBeenCalledWith("123456", {
      challengeToken: "sv_tok",
      magicToken: MAGIC_TOKEN,
    });
    // Then the usual passkey offer (passkeys on, browser can make one).
    expect(result.current.flow.view).toBe("webauthn_register");
  });

  it("keeps the step on a wrong code, with the error", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      verifyMagicLinkToken: vi.fn(async () => verificationRequired()),
      verifySignInVerification: vi.fn(async () => ({ data: null, error: { message: "Invalid code" } })),
    });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("verification_required"));
    let ok = true;
    await act(async () => {
      ok = await result.current.flow.submitVerificationCode("000000");
    });
    expect(ok).toBe(false);
    expect(result.current.flow.error).toBe("Invalid code");
    expect(result.current.flow.view).toBe("verification_required");
    expect(client.signInWithTokenPayload).not.toHaveBeenCalled();
  });

  it("follows MFA after the code", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      verifyMagicLinkToken: vi.fn(async () => verificationRequired()),
    });
    client.verifySignInVerification.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.MFA_REQUIRED);
      return {
        data: { mfaRequired: true, mfaChallenge: { token: "chl_1", method: "totp" }, availableMethods: ["totp"] },
        error: null,
      };
    });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("verification_required"));
    await act(async () => {
      await result.current.flow.submitVerificationCode("123456");
    });
    expect(result.current.flow.view).toBe("mfa_verify");
    expect(result.current.flow.mfaChallenge).toEqual({ token: "chl_1", method: "totp" });
  });

  it("shows an error when the API couldn't make the challenge", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      verifyMagicLinkToken: vi.fn(async () => verificationRequired(null)),
    });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("error"));
    expect(result.current.flow.errorCode).toBe("verification_unavailable");
  });
});

describe("passkey support", () => {
  it("reports whether the browser can make a passkey", async () => {
    const { result } = await renderAtLogin(createFakeClient({ isWebauthnSupported: vi.fn(() => false) }));
    expect(result.current.flow.passkeysSupported).toBe(false);
  });

  it("skips the passkey offer after a magic link where passkeys can't work", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({ isWebauthnSupported: vi.fn(() => false) });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("authenticated"));
    expect(client.signInWithTokenPayload).toHaveBeenCalledWith(AUTH_PAYLOAD);
    expect(client.addDevice).not.toHaveBeenCalled();
  });

  it("skips the passkey offer after a code where passkeys can't work", async () => {
    const client = createFakeClient({
      isWebauthnSupported: vi.fn(() => false),
      verifyOtp: vi.fn(async () => ({ data: { authPayload: AUTH_PAYLOAD }, error: null })),
    });
    otpSignIn(client);
    const { result } = await renderAtLogin(client);
    await act(async () => {
      await result.current.flow.submitIdentifier("ada@example.com");
    });
    let ok = false;
    await act(async () => {
      ok = await result.current.flow.submitOtp("123456");
    });
    expect(ok).toBe(true);
    expect(result.current.flow.view).toBe("authenticated");
    expect(client.addDevice).not.toHaveBeenCalled();
  });

  it("keeps the passkey error code from addDevice", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      addDevice: vi.fn(async () => ({
        data: null,
        error: { message: "Passkeys aren't available on this page.", code: "ERROR_PASSKEYS_UNAVAILABLE" },
      })),
    });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("webauthn_register"));
    await act(async () => {
      await result.current.flow.registerPasskey();
    });
    expect(result.current.flow.errorCode).toBe("ERROR_PASSKEYS_UNAVAILABLE");
  });
});

describe("sign-in refusals", () => {
  it.each(["user_banned", "user_suspended", "ip_blocked", "country_blocked"])(
    "keeps the API's %s code next to the message",
    async (code) => {
      const client = createFakeClient({
        signInOrUp: vi.fn(async () => ({
          data: null,
          error: { message: "Refused", code: 403, json: { error: "Refused", error_code: code } },
        })),
      });
      const { result } = await renderAtLogin(client);
      await act(async () => {
        await result.current.flow.submitIdentifier("ada@example.com");
      });
      expect(result.current.flow.view).toBe("login");
      expect(result.current.flow.error).toBe("Refused");
      expect(result.current.flow.errorCode).toBe(code);
    }
  );

  it("keeps the code when the magic link is refused on landing", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = createFakeClient({
      verifyMagicLinkToken: vi.fn(async () => ({
        data: null,
        error: { message: "Account is suspended", json: { error_code: "user_suspended" } },
      })),
    });
    const { result } = renderFlow(client);
    await waitFor(() => expect(result.current.flow.view).toBe("error"));
    expect(result.current.flow.errorCode).toBe("user_suspended");
  });

  it("retry clears the code", async () => {
    const client = createFakeClient({
      signInOrUp: vi.fn(async () => ({ data: null, error: { message: "x", json: { error_code: "ip_blocked" } } })),
    });
    const { result } = await renderAtLogin(client);
    await act(async () => {
      await result.current.flow.submitIdentifier("ada@example.com");
    });
    act(() => result.current.flow.retry());
    expect(result.current.flow.errorCode).toBeNull();
  });
});

describe("a cancelled passkey prompt", () => {
  it("falls back to a magic link", async () => {
    const client = createFakeClient({
      signInOrUp: vi.fn(async () => ({ data: null, error: { name: "NotAllowedError", message: "cancelled" } })),
    });
    client.sendLoginMagicLink.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.MAGIC_PENDING);
      return { data: { magic_link: { id: "ml_fallback" } }, error: null };
    });
    const { result } = await renderAtLogin(client);
    await act(async () => {
      await result.current.flow.submitIdentifier("ada@example.com");
    });
    expect(client.sendLoginMagicLink).toHaveBeenCalledWith("ada@example.com");
    expect(result.current.flow.view).toBe("magic_pending");
    expect(result.current.flow.error).toBeNull();
  });

  it("falls back to a code when the app signs in by code", async () => {
    const client = createFakeClient({
      signInOrUp: vi.fn(async () => ({ data: null, error: { code: "ERROR_CEREMONY_ABORTED", message: "aborted" } })),
      getAppData: vi.fn(async () => ({ data: { passkeys_enabled: true, email_auth_type: "otp" }, error: null })),
    });
    const { result } = await renderAtLogin(client);
    await act(async () => {
      await result.current.flow.submitIdentifier("ada@example.com");
    });
    expect(client.sendLoginOtp).toHaveBeenCalledWith("ada@example.com");
    expect(client.sendLoginMagicLink).not.toHaveBeenCalled();
  });
});

describe("MFA", () => {
  const challenge = { token: "chl_1", method: "email_otp", delivery_required: true };

  async function atMfa(client: FakeClient) {
    client.signInOrUp.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.MFA_REQUIRED);
      return {
        data: { mfaRequired: true, mfaChallenge: challenge, availableMethods: ["email", "totp", "backup_codes"] },
        error: null,
      };
    });
    const r = await renderAtLogin(client);
    await act(async () => {
      await r.result.current.flow.submitIdentifier("ada@example.com");
    });
    expect(r.result.current.flow.view).toBe("mfa_verify");
    return r;
  }

  it("resendMfaCode replaces the challenge with the new one", async () => {
    const client = createFakeClient();
    client.resendChallenge.mockResolvedValue({ data: { challenge: { ...challenge, token: "chl_2" } }, error: null });
    const { result } = await atMfa(client);
    let failure: string | null = "unset";
    await act(async () => {
      failure = await result.current.flow.resendMfaCode();
    });
    expect(failure).toBeNull();
    expect(client.resendChallenge).toHaveBeenCalledWith("chl_1");
    expect(result.current.flow.mfaChallenge.token).toBe("chl_2");
    expect(result.current.flow.mfaResent).toBe(true);
  });

  it("switchMfaMethod moves to the new method's challenge, and reports a failure", async () => {
    const client = createFakeClient();
    client.switchMfaMethod.mockResolvedValueOnce({ data: { token: "chl_3", method: "backup_code" }, error: null });
    const { result } = await atMfa(client);
    await act(async () => {
      await result.current.flow.switchMfaMethod("backup_code");
    });
    expect(client.switchMfaMethod).toHaveBeenCalledWith("chl_1", "backup_code");
    expect(result.current.flow.mfaChallenge).toEqual({ token: "chl_3", method: "backup_code" });

    client.switchMfaMethod.mockResolvedValueOnce({ data: null, error: { message: "Not set up" } });
    let failure: string | null = null;
    await act(async () => {
      failure = await result.current.flow.switchMfaMethod("totp");
    });
    expect(failure).toBe("Not set up");
    expect(result.current.flow.mfaChallenge.token).toBe("chl_3");
  });

  it("submitMfaCode resolves false for a wrong code", async () => {
    const client = createFakeClient({
      verifyMfaChallenge: vi.fn(async () => ({ data: null, error: { message: "Invalid code" } })),
    });
    const { result } = await atMfa(client);
    let ok = true;
    await act(async () => {
      ok = await result.current.flow.submitMfaCode("000000");
    });
    expect(ok).toBe(false);
  });

  it("reads the challenge the client holds when MFA_REQUIRED comes first", async () => {
    const client = createFakeClient();
    client.pendingMfaChallenge = { mfa_challenge: challenge, available_methods: ["email"] };
    const { result } = await renderAtLogin(client);
    act(() => client.emit(AUTH_CHANGE_EVENTS.MFA_REQUIRED));
    expect(result.current.flow.mfaChallenge).toEqual(challenge);
    expect(result.current.flow.mfaAvailableMethods).toEqual(["email"]);
  });

  it("reads the grace period from the client on MFA_ENROLLMENT_SUGGESTED", async () => {
    const client = createFakeClient();
    client.pendingMfaEnrollmentSuggestion = { mfa_grace_days_remaining: 4, available_methods: ["totp"] };
    const { result } = await renderAtLogin(client);
    act(() => client.emit(AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_SUGGESTED));
    expect(result.current.flow.view).toBe("mfa_enroll_suggest");
    expect(result.current.flow.mfaGraceDaysRemaining).toBe(4);
    expect(result.current.flow.mfaGracePeriod).toBe(true);
  });
});

describe("OAuth", () => {
  it("signInWithOAuth hands the provider to the client", async () => {
    const { client, result } = await renderAtLogin();
    act(() => result.current.flow.signInWithOAuth("google"));
    expect(client.signInWithOAuthProvider).toHaveBeenCalledWith("google");
  });
});
