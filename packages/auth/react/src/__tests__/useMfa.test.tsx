import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_CHANGE_EVENTS } from "@scute/js-core";
import {
  useBackupCodes,
  useEnrollMfa,
  useFactorList,
  useMfaVerify,
} from "../useMfa";
import { useAuth } from "../AuthContext";
import {
  authenticatedSession,
  createFakeClient,
  deferred,
  makeUser,
  makeWrapper,
  unauthenticatedSession,
} from "./fakeScuteClient";

afterEach(() => {
  vi.restoreAllMocks();
});

const totpEnrollment = {
  id: "enr_totp_1",
  method: "totp",
  name: "Phone",
  verified: false,
  is_default: false,
  last_used_at: null,
  created_at: "2026-01-01T00:00:00Z",
};

const TOTP_SECRET = "JBSWY3DPEHPK3PXP";
const TOTP_URI = `otpauth://totp/Scute:ada@example.com?secret=${TOTP_SECRET}&issuer=Scute`;

function setup<T>(hook: () => T, overrides: Record<string, unknown> = {}) {
  const client = createFakeClient(overrides);
  const rendered = renderHook(hook, { wrapper: makeWrapper(client) });
  return { client, ...rendered };
}

describe("hooks require a provider", () => {
  it.each([
    ["useEnrollMfa", useEnrollMfa],
    ["useMfaVerify", useMfaVerify],
    ["useFactorList", useFactorList],
    ["useBackupCodes", useBackupCodes],
  ])("%s throws outside AuthContextProvider", (_name, hook) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => (hook as () => unknown)())).toThrow(
      "useScuteClient must be used within a AuthContextProvider."
    );
  });
});

describe("useEnrollMfa", () => {
  it("starts idle with nothing in state", () => {
    const { result } = setup(() => useEnrollMfa());
    expect(result.current.state).toBe("idle");
    expect(result.current.enrollment).toBeNull();
    expect(result.current.provisioningUri).toBeNull();
    expect(result.current.secret).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("enroll(totp) passes params through and lands in pending_verify with the one-shot secrets", async () => {
    const { client, result } = setup(() => useEnrollMfa());
    const d = deferred<any>();
    client.enrollMfa.mockReturnValue(d.promise);

    let pending!: Promise<any>;
    act(() => {
      pending = result.current.enroll({ method: "totp", name: "Phone" });
    });
    expect(result.current.state).toBe("enrolling");
    expect(client.enrollMfa).toHaveBeenCalledWith({ method: "totp", name: "Phone" });

    const data = { enrollment: totpEnrollment, provisioning_uri: TOTP_URI, secret: TOTP_SECRET };
    let returned: any;
    await act(async () => {
      d.resolve({ data, error: null });
      returned = await pending;
    });
    expect(returned).toEqual({ data, error: null });
    expect(result.current.state).toBe("pending_verify");
    expect(result.current.enrollment).toEqual(totpEnrollment);
    expect(result.current.provisioningUri).toBe(TOTP_URI);
    expect(result.current.secret).toBe(TOTP_SECRET);
  });

  it("enroll(sms) forwards secret_data (the phone) to the client", async () => {
    const { client, result } = setup(() => useEnrollMfa());
    client.enrollMfa.mockResolvedValue({
      data: { enrollment: { ...totpEnrollment, id: "enr_sms", method: "sms" } },
      error: null,
    });
    await act(async () => {
      await result.current.enroll({ method: "sms", secret_data: "+15555550100" });
    });
    expect(client.enrollMfa).toHaveBeenCalledWith({ method: "sms", secret_data: "+15555550100" });
    expect(result.current.state).toBe("pending_verify");
    // No TOTP material for sms.
    expect(result.current.provisioningUri).toBeNull();
    expect(result.current.secret).toBeNull();
  });

  it("enroll surfaces the client error object as-is and moves to error", async () => {
    const { client, result } = setup(() => useEnrollMfa());
    const err = { message: "Method not allowed", code: "mfa_method_not_allowed" };
    client.enrollMfa.mockResolvedValue({ data: null, error: err });
    let returned: any;
    await act(async () => {
      returned = await result.current.enroll({ method: "totp" });
    });
    expect(returned).toEqual({ data: null, error: err });
    expect(result.current.error).toBe(err);
    expect(result.current.state).toBe("error");
  });

  it("enroll with neither data nor error reports a generic failure", async () => {
    const { client, result } = setup(() => useEnrollMfa());
    client.enrollMfa.mockResolvedValue({ data: null, error: null });
    let returned: any;
    await act(async () => {
      returned = await result.current.enroll({ method: "email" });
    });
    expect(returned).toEqual({ data: null, error: { message: "Enrollment failed" } });
    expect(result.current.error).toEqual({ message: "Enrollment failed" });
    expect(result.current.state).toBe("error");
  });

  it("verify without an enrollment errors locally and never calls the client", async () => {
    const { client, result } = setup(() => useEnrollMfa());
    let returned: any;
    await act(async () => {
      returned = await result.current.verify("123456");
    });
    expect(returned).toEqual({ data: null, error: { message: "No enrollment in progress" } });
    expect(result.current.error).toEqual({ message: "No enrollment in progress" });
    expect(result.current.state).toBe("idle");
    expect(client.verifyMfaEnrollment).not.toHaveBeenCalled();
  });

  it("verify success sends (enrollment.id, code), marks verified and drops the secrets", async () => {
    const { client, result } = setup(() => useEnrollMfa());
    client.enrollMfa.mockResolvedValue({
      data: { enrollment: totpEnrollment, provisioning_uri: TOTP_URI, secret: TOTP_SECRET },
      error: null,
    });
    await act(async () => {
      await result.current.enroll({ method: "totp" });
    });

    const d = deferred<any>();
    client.verifyMfaEnrollment.mockReturnValue(d.promise);
    let pending!: Promise<any>;
    act(() => {
      pending = result.current.verify("654321");
    });
    expect(result.current.state).toBe("verifying");
    expect(client.verifyMfaEnrollment).toHaveBeenCalledWith("enr_totp_1", "654321");

    const verified = { ...totpEnrollment, verified: true };
    await act(async () => {
      d.resolve({ data: { enrollment: verified }, error: null });
      await pending;
    });
    expect(result.current.state).toBe("verified");
    expect(result.current.enrollment).toEqual(verified);
    expect(result.current.provisioningUri).toBeNull();
    expect(result.current.secret).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("verify failure keeps the enrollment and secrets so the user can retry", async () => {
    const { client, result } = setup(() => useEnrollMfa());
    client.enrollMfa.mockResolvedValue({
      data: { enrollment: totpEnrollment, provisioning_uri: TOTP_URI, secret: TOTP_SECRET },
      error: null,
    });
    await act(async () => {
      await result.current.enroll({ method: "totp" });
    });
    const err = { message: "Invalid code" };
    client.verifyMfaEnrollment.mockResolvedValueOnce({ data: null, error: err });
    let returned: any;
    await act(async () => {
      returned = await result.current.verify("000000");
    });
    expect(returned).toEqual({ data: null, error: err });
    expect(result.current.state).toBe("error");
    expect(result.current.error).toBe(err);
    expect(result.current.secret).toBe(TOTP_SECRET);
    expect(result.current.provisioningUri).toBe(TOTP_URI);

    client.verifyMfaEnrollment.mockResolvedValueOnce({
      data: { enrollment: { ...totpEnrollment, verified: true } },
      error: null,
    });
    await act(async () => {
      await result.current.verify("111111");
    });
    expect(client.verifyMfaEnrollment).toHaveBeenLastCalledWith("enr_totp_1", "111111");
    expect(result.current.state).toBe("verified");
    expect(result.current.error).toBeNull();
  });

  it("verify with neither data nor error reports a generic failure", async () => {
    const { client, result } = setup(() => useEnrollMfa());
    client.enrollMfa.mockResolvedValue({ data: { enrollment: totpEnrollment }, error: null });
    await act(async () => {
      await result.current.enroll({ method: "totp" });
    });
    client.verifyMfaEnrollment.mockResolvedValue({ data: null, error: null });
    let returned: any;
    await act(async () => {
      returned = await result.current.verify("123456");
    });
    expect(returned).toEqual({ data: null, error: { message: "Verification failed" } });
    expect(result.current.state).toBe("error");
  });

  it("reset clears state, enrollment, secrets and error", async () => {
    const { client, result } = setup(() => useEnrollMfa());
    client.enrollMfa.mockResolvedValue({
      data: { enrollment: totpEnrollment, provisioning_uri: TOTP_URI, secret: TOTP_SECRET },
      error: null,
    });
    await act(async () => {
      await result.current.enroll({ method: "totp" });
    });
    act(() => result.current.reset());
    expect(result.current.state).toBe("idle");
    expect(result.current.enrollment).toBeNull();
    expect(result.current.provisioningUri).toBeNull();
    expect(result.current.secret).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("keeps the TOTP secret in state after the user signs out", async () => {
    const { client, result } = setup(() => ({ mfa: useEnrollMfa(), auth: useAuth() }));
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_IN, authenticatedSession(), makeUser()));
    client.enrollMfa.mockResolvedValue({
      data: { enrollment: totpEnrollment, provisioning_uri: TOTP_URI, secret: TOTP_SECRET },
      error: null,
    });
    await act(async () => {
      await result.current.mfa.enroll({ method: "totp" });
    });
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_OUT, unauthenticatedSession(), null));
    expect(result.current.auth.isAuthenticated).toBe(false);
    // CURRENT BEHAVIOR (suspected bug): the hook does not watch auth state,
    // so an unverified TOTP seed and otpauth URI stay renderable after
    // sign-out (shared-device exposure) until reset() or unmount.
    expect(result.current.mfa.secret).toBe(TOTP_SECRET);
    expect(result.current.mfa.provisioningUri).toBe(TOTP_URI);
    expect(result.current.mfa.state).toBe("pending_verify");
  });
});

describe("useMfaVerify", () => {
  const challenge = {
    mfa_required: true,
    app_user_id: "au_1",
    mfa_challenge: { token: "chl_totp_1", method: "totp", status: "pending" },
    available_methods: ["totp", "backup_code"],
  };

  it("snapshots the client's pending challenge and derives the token from mfa_challenge.token", () => {
    const { result } = setup(() => useMfaVerify(), { pendingMfaChallenge: challenge });
    expect(result.current.pendingChallenge).toBe(challenge);
    expect(result.current.challengeToken).toBe("chl_totp_1");
    expect(result.current.state).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("falls back to a top-level token field when there is no mfa_challenge", () => {
    const { result } = setup(() => useMfaVerify(), { pendingMfaChallenge: { token: "chl_flat" } });
    expect(result.current.challengeToken).toBe("chl_flat");
  });

  it("has a null token when the client has no pending challenge", () => {
    const { result } = setup(() => useMfaVerify());
    expect(result.current.pendingChallenge).toBeNull();
    expect(result.current.challengeToken).toBeNull();
  });

  it("does not pick up a challenge that appears after mount", () => {
    const { client, result } = setup(() => useMfaVerify());
    client.pendingMfaChallenge = challenge;
    act(() => client.emit(AUTH_CHANGE_EVENTS.MFA_REQUIRED));
    // CURRENT BEHAVIOR (suspected bug): the snapshot only refreshes when the
    // client instance changes, not on MFA_REQUIRED. A verify screen mounted
    // before primary auth finishes stays tokenless and every verify() fails
    // with "No pending MFA challenge" (REF-16).
    expect(result.current.challengeToken).toBeNull();
  });

  it("verify without a challenge errors locally and does not call the client", async () => {
    const { client, result } = setup(() => useMfaVerify());
    let returned: any;
    await act(async () => {
      returned = await result.current.verify("123456");
    });
    expect(returned).toEqual({ data: null, error: { message: "No pending MFA challenge" } });
    expect(result.current.error).toEqual({ message: "No pending MFA challenge" });
    expect(result.current.state).toBe("idle");
    expect(client.verifyMfaChallenge).not.toHaveBeenCalled();
  });

  it("verify success calls verifyMfaChallenge(token, code) and ends verified", async () => {
    const { client, result } = setup(() => useMfaVerify(), { pendingMfaChallenge: challenge });
    const d = deferred<any>();
    client.verifyMfaChallenge.mockReturnValue(d.promise);
    let pending!: Promise<any>;
    act(() => {
      pending = result.current.verify("246810");
    });
    expect(result.current.state).toBe("verifying");
    expect(client.verifyMfaChallenge).toHaveBeenCalledWith("chl_totp_1", "246810");
    let returned: any;
    await act(async () => {
      // Real client shape: verifyMfaChallenge signs in and returns { error: null }.
      d.resolve({ error: null });
      returned = await pending;
    });
    expect(returned).toEqual({ error: null });
    expect(result.current.state).toBe("verified");
    expect(result.current.error).toBeNull();
  });

  it("verify failure stores the client error and returns the raw result", async () => {
    const { client, result } = setup(() => useMfaVerify(), { pendingMfaChallenge: challenge });
    const err = { message: "Invalid code", code: "invalid_code" };
    client.verifyMfaChallenge.mockResolvedValue({ data: null, error: err });
    let returned: any;
    await act(async () => {
      returned = await result.current.verify("000000");
    });
    expect(returned).toEqual({ data: null, error: err });
    expect(result.current.error).toBe(err);
    expect(result.current.state).toBe("error");
  });

  it("switchMethod calls the client, adopts the new challenge and resets to idle", async () => {
    const { client, result } = setup(() => useMfaVerify(), { pendingMfaChallenge: challenge });
    client.verifyMfaChallenge.mockResolvedValue({ data: null, error: { message: "Invalid code" } });
    await act(async () => {
      await result.current.verify("000000");
    });
    expect(result.current.state).toBe("error");

    const switched = { ...challenge, mfa_challenge: { token: "chl_backup_2", method: "backup_code" } };
    client.switchMfaMethod.mockImplementation(async () => {
      client.pendingMfaChallenge = switched;
      return { data: switched.mfa_challenge, error: null };
    });
    let returned: any;
    await act(async () => {
      returned = await result.current.switchMethod("backup_code");
    });
    expect(client.switchMfaMethod).toHaveBeenCalledWith("chl_totp_1", "backup_code");
    expect(returned).toEqual({ data: switched.mfa_challenge, error: null });
    expect(result.current.challengeToken).toBe("chl_backup_2");
    expect(result.current.state).toBe("idle");
    expect(result.current.error).toBeNull();

    client.verifyMfaChallenge.mockResolvedValue({ error: null });
    await act(async () => {
      await result.current.verify("abcd-efgh");
    });
    expect(client.verifyMfaChallenge).toHaveBeenLastCalledWith("chl_backup_2", "abcd-efgh");
  });

  it("switchMethod failure is returned but not surfaced in hook state", async () => {
    const { client, result } = setup(() => useMfaVerify(), { pendingMfaChallenge: challenge });
    const err = { message: "Method not available" };
    client.switchMfaMethod.mockResolvedValue({ data: null, error: err });
    let returned: any;
    await act(async () => {
      returned = await result.current.switchMethod("sms");
    });
    expect(returned).toEqual({ data: null, error: err });
    // CURRENT BEHAVIOR (suspected bug): a failed switch leaves `error` null
    // and forces state to "idle", so a UI driven by hook state shows no
    // failure. The real client has already cancelled the old challenge
    // before the failing create, so the token kept here is dead.
    expect(result.current.error).toBeNull();
    expect(result.current.state).toBe("idle");
    expect(result.current.challengeToken).toBe("chl_totp_1");
  });

  it("switchMethod without a challenge errors locally", async () => {
    const { client, result } = setup(() => useMfaVerify());
    let returned: any;
    await act(async () => {
      returned = await result.current.switchMethod("sms");
    });
    expect(returned).toEqual({ data: null, error: { message: "No pending MFA challenge" } });
    expect(client.switchMfaMethod).not.toHaveBeenCalled();
  });

  it("resend calls resendChallenge(token) and passes the result through", async () => {
    const { client, result } = setup(() => useMfaVerify(), { pendingMfaChallenge: challenge });
    const ok = { data: { challenge: { token: "chl_totp_1", status: "pending" } }, error: null };
    client.resendChallenge.mockResolvedValue(ok);
    let returned: any;
    await act(async () => {
      returned = await result.current.resend();
    });
    expect(client.resendChallenge).toHaveBeenCalledWith("chl_totp_1");
    expect(returned).toBe(ok);
  });

  it("resend failure is returned but not stored in error", async () => {
    const { client, result } = setup(() => useMfaVerify(), { pendingMfaChallenge: challenge });
    const err = { message: "Too many resends" };
    client.resendChallenge.mockResolvedValue({ data: null, error: err });
    let returned: any;
    await act(async () => {
      returned = await result.current.resend();
    });
    expect(returned).toEqual({ data: null, error: err });
    // CURRENT BEHAVIOR (suspected bug): unlike verify(), resend() never sets
    // `error`, so rate-limit or delivery failures are invisible to UIs that
    // render from hook state.
    expect(result.current.error).toBeNull();
    expect(result.current.state).toBe("idle");
  });

  it("resend without a challenge errors locally", async () => {
    const { client, result } = setup(() => useMfaVerify());
    let returned: any;
    await act(async () => {
      returned = await result.current.resend();
    });
    expect(returned).toEqual({ data: null, error: { message: "No pending MFA challenge" } });
    expect(result.current.error).toEqual({ message: "No pending MFA challenge" });
    expect(client.resendChallenge).not.toHaveBeenCalled();
  });

  it("cancel calls cancelChallenge(token) then forgets the challenge", async () => {
    const { client, result } = setup(() => useMfaVerify(), { pendingMfaChallenge: challenge });
    client.cancelChallenge.mockResolvedValue({ data: null, error: null });
    await act(async () => {
      await result.current.cancel();
    });
    expect(client.cancelChallenge).toHaveBeenCalledWith("chl_totp_1");
    expect(result.current.pendingChallenge).toBeNull();
    expect(result.current.challengeToken).toBeNull();
    expect(result.current.state).toBe("idle");

    let returned: any;
    await act(async () => {
      returned = await result.current.verify("123456");
    });
    expect(returned.error).toEqual({ message: "No pending MFA challenge" });
    expect(client.verifyMfaChallenge).not.toHaveBeenCalled();
  });

  it("cancel forgets the challenge locally even when the server cancel fails", async () => {
    const { client, result } = setup(() => useMfaVerify(), { pendingMfaChallenge: challenge });
    const err = { message: "Network error" };
    client.cancelChallenge.mockResolvedValue({ data: null, error: err });
    let returned: any;
    await act(async () => {
      returned = await result.current.cancel();
    });
    expect(returned).toEqual({ data: null, error: err });
    // CURRENT BEHAVIOR (suspected bug): the challenge may still be live on
    // the server, but the hook drops it and reports no error. The client's
    // own pendingMfaChallenge is also left untouched, so a remounted hook
    // would snapshot the "cancelled" challenge again.
    expect(result.current.challengeToken).toBeNull();
    expect(result.current.error).toBeNull();
    expect(client.pendingMfaChallenge).toBe(challenge);
  });

  it("cancel without a challenge is a silent no-op", async () => {
    const { client, result } = setup(() => useMfaVerify());
    let returned: any;
    await act(async () => {
      returned = await result.current.cancel();
    });
    expect(returned).toEqual({ data: null, error: null });
    expect(client.cancelChallenge).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });
});

describe("useFactorList", () => {
  const factors = [
    { ...totpEnrollment, verified: true, is_default: true },
    { ...totpEnrollment, id: "enr_sms_1", method: "sms", name: null, verified: true },
  ];

  it("loads on mount and exposes factors, backup code count and mfaEnabled", async () => {
    const d = deferred<any>();
    const { client, result } = setup(() => useFactorList(), {
      listMfaMethods: vi.fn(() => d.promise),
    });
    expect(client.listMfaMethods).toHaveBeenCalledTimes(1);
    expect(client.listMfaMethods).toHaveBeenCalledWith();
    expect(result.current.loading).toBe(true);
    expect(result.current.factors).toEqual([]);

    await act(async () => {
      d.resolve({ data: { methods: factors, backup_codes_available: 7, mfa_enabled: true }, error: null });
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.factors).toEqual(factors);
    expect(result.current.backupCodesAvailable).toBe(7);
    expect(result.current.mfaEnabled).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("defaults missing fields to empty list, zero codes and disabled", async () => {
    const { result } = setup(() => useFactorList(), {
      listMfaMethods: vi.fn(async () => ({ data: {}, error: null })),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.factors).toEqual([]);
    expect(result.current.backupCodesAvailable).toBe(0);
    expect(result.current.mfaEnabled).toBe(false);
  });

  it("surfaces the client error when signed out instead of an empty list", async () => {
    // This is the shape listMfaMethods returns when getAuthToken fails.
    const authErr = { message: "Invalid auth token", code: 401 };
    const { result } = setup(() => useFactorList(), {
      listMfaMethods: vi.fn(async () => ({ data: null, error: authErr })),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // CURRENT BEHAVIOR (suspected bug): the JSDoc promises "an empty list
    // (not an error) while unauthenticated", but the auth error is surfaced.
    expect(result.current.error).toBe(authErr);
    expect(result.current.factors).toEqual([]);
  });

  it("keeps previously loaded factors when a later refresh fails", async () => {
    const { client, result } = setup(() => useFactorList(), {
      listMfaMethods: vi.fn(async () => ({
        data: { methods: factors, backup_codes_available: 2, mfa_enabled: true },
        error: null,
      })),
    });
    await waitFor(() => expect(result.current.factors).toHaveLength(2));
    client.listMfaMethods.mockResolvedValueOnce({ data: null, error: { message: "Server error" } });
    let returned: any;
    await act(async () => {
      returned = await result.current.refresh();
    });
    expect(returned).toEqual({ data: null, error: { message: "Server error" } });
    expect(result.current.error).toEqual({ message: "Server error" });
    expect(result.current.factors).toEqual(factors);
    expect(result.current.mfaEnabled).toBe(true);
  });

  it("refresh with neither data nor error leaves error null", async () => {
    const { client, result } = setup(() => useFactorList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    client.listMfaMethods.mockResolvedValueOnce({ data: null, error: null });
    let returned: any;
    await act(async () => {
      returned = await result.current.refresh();
    });
    expect(returned).toEqual({ data: null, error: null });
    expect(result.current.error).toBeNull();
  });

  it("remove calls removeMfaMethod(id) and refreshes on success", async () => {
    const { client, result } = setup(() => useFactorList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    client.removeMfaMethod.mockResolvedValue({ data: {}, error: null });
    client.listMfaMethods.mockResolvedValueOnce({
      data: { methods: [factors[1]], backup_codes_available: 0, mfa_enabled: true },
      error: null,
    });
    let returned: any;
    await act(async () => {
      returned = await result.current.remove("enr_totp_1");
    });
    expect(client.removeMfaMethod).toHaveBeenCalledWith("enr_totp_1");
    expect(returned).toEqual({ data: {}, error: null });
    expect(client.listMfaMethods).toHaveBeenCalledTimes(2);
    expect(result.current.factors).toEqual([factors[1]]);
  });

  it("remove failure returns the error and skips the refresh", async () => {
    const { client, result } = setup(() => useFactorList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const err = { message: "Cannot remove last factor" };
    client.removeMfaMethod.mockResolvedValue({ data: null, error: err });
    let returned: any;
    await act(async () => {
      returned = await result.current.remove("enr_totp_1");
    });
    expect(returned).toEqual({ data: null, error: err });
    expect(client.listMfaMethods).toHaveBeenCalledTimes(1);
    // remove() does not write the error into hook state.
    expect(result.current.error).toBeNull();
  });

  it("setDefault calls setDefaultMfaMethod(id) and refreshes on success", async () => {
    const { client, result } = setup(() => useFactorList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    client.setDefaultMfaMethod.mockResolvedValue({ data: {}, error: null });
    await act(async () => {
      await result.current.setDefault("enr_sms_1");
    });
    expect(client.setDefaultMfaMethod).toHaveBeenCalledWith("enr_sms_1");
    expect(client.listMfaMethods).toHaveBeenCalledTimes(2);
  });

  it("setDefault failure returns the error and skips the refresh", async () => {
    const { client, result } = setup(() => useFactorList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const err = { message: "Not verified" };
    client.setDefaultMfaMethod.mockResolvedValue({ data: null, error: err });
    let returned: any;
    await act(async () => {
      returned = await result.current.setDefault("enr_sms_1");
    });
    expect(returned).toEqual({ data: null, error: err });
    expect(client.listMfaMethods).toHaveBeenCalledTimes(1);
  });

  it("a refresh that resolves after unmount returns an empty result", async () => {
    const d = deferred<any>();
    const { result, unmount } = setup(() => useFactorList(), {
      listMfaMethods: vi.fn(() => d.promise),
    });
    const pending = result.current.refresh();
    unmount();
    d.resolve({ data: { methods: factors, backup_codes_available: 1, mfa_enabled: true }, error: null });
    await expect(pending).resolves.toEqual({ data: null, error: null });
  });
});

describe("useBackupCodes", () => {
  const codes = ["aaaa-1111", "bbbb-2222", "cccc-3333"];

  it("starts empty and does not call the client on mount", () => {
    const { client, result } = setup(() => useBackupCodes());
    expect(result.current.codes).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(client.generateBackupCodes).not.toHaveBeenCalled();
  });

  it("generate calls generateBackupCodes() and stores the plaintext codes", async () => {
    const { client, result } = setup(() => useBackupCodes());
    const d = deferred<any>();
    client.generateBackupCodes.mockReturnValue(d.promise);
    let pending!: Promise<any>;
    act(() => {
      pending = result.current.generate();
    });
    expect(result.current.loading).toBe(true);
    expect(client.generateBackupCodes).toHaveBeenCalledWith();
    let returned: any;
    await act(async () => {
      d.resolve({ data: { backup_codes: codes }, error: null });
      returned = await pending;
    });
    expect(returned).toEqual({ data: { backup_codes: codes }, error: null });
    expect(result.current.codes).toEqual(codes);
    expect(result.current.loading).toBe(false);
  });

  it("generate with a missing backup_codes field yields an empty list", async () => {
    const { client, result } = setup(() => useBackupCodes());
    client.generateBackupCodes.mockResolvedValue({ data: { message: "ok" }, error: null });
    await act(async () => {
      await result.current.generate();
    });
    expect(result.current.codes).toEqual([]);
  });

  it("generate failure sets the error and keeps any earlier codes", async () => {
    const { client, result } = setup(() => useBackupCodes());
    client.generateBackupCodes.mockResolvedValueOnce({ data: { backup_codes: codes }, error: null });
    await act(async () => {
      await result.current.generate();
    });
    const err = { message: "Rate limited" };
    client.generateBackupCodes.mockResolvedValueOnce({ data: null, error: err });
    let returned: any;
    await act(async () => {
      returned = await result.current.generate();
    });
    expect(returned).toEqual({ data: null, error: err });
    expect(result.current.error).toBe(err);
    expect(result.current.loading).toBe(false);
    expect(result.current.codes).toEqual(codes);
  });

  it("clear drops the plaintext codes from state", async () => {
    const { client, result } = setup(() => useBackupCodes());
    client.generateBackupCodes.mockResolvedValue({ data: { backup_codes: codes }, error: null });
    await act(async () => {
      await result.current.generate();
    });
    act(() => result.current.clear());
    expect(result.current.codes).toBeNull();
  });

  it("keeps plaintext codes in state after the user signs out", async () => {
    const { client, result } = setup(() => ({ codes: useBackupCodes(), auth: useAuth() }));
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_IN, authenticatedSession(), makeUser()));
    client.generateBackupCodes.mockResolvedValue({ data: { backup_codes: codes }, error: null });
    await act(async () => {
      await result.current.codes.generate();
    });
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_OUT, unauthenticatedSession(), null));
    expect(result.current.auth.isAuthenticated).toBe(false);
    // CURRENT BEHAVIOR (suspected bug): recovery codes are not cleared on
    // sign-out; they stay renderable until clear() or unmount.
    expect(result.current.codes.codes).toEqual(codes);
  });
});
