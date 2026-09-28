import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@scute/react-hooks";
import { useSecureAccount } from "../useSecureAccount";
import {
  AUTH_CHANGE_EVENTS,
  createFakeClient,
  deferred,
  makeWrapper,
} from "./fakeScuteClient";

afterEach(() => {
  vi.restoreAllMocks();
});

const TOTP_SECRET = "JBSWY3DPEHPK3PXP";
const TOTP_URI = `otpauth://totp/Scute:ada@example.com?secret=${TOTP_SECRET}`;

const ENROLLED = {
  methods: [
    { id: "enr_totp_1", method: "totp", name: null, verified: true, is_default: true },
    { id: "enr_sms_1", method: "sms", name: null, verified: false, is_default: false },
  ],
  backup_codes_available: 4,
  mfa_enabled: true,
};

function setup(overrides: Record<string, unknown> = {}) {
  const client = createFakeClient(overrides);
  const r = renderHook(() => ({ sa: useSecureAccount(), auth: useAuth() }), {
    wrapper: makeWrapper(client),
  });
  return { client, ...r };
}

async function signedIn(overrides: Record<string, unknown> = {}) {
  const r = setup({
    listMfaMethods: vi.fn(async () => ({ data: ENROLLED, error: null })),
    ...overrides,
  });
  act(() => r.client.emitSignedIn());
  await waitFor(() => expect(r.result.current.sa.loading).toBe(false));
  return r;
}

async function signedOut(overrides: Record<string, unknown> = {}) {
  const r = setup(overrides);
  act(() => r.client.emit(AUTH_CHANGE_EVENTS.INITIAL_SESSION));
  await waitFor(() => expect(r.result.current.sa.loading).toBe(false));
  return r;
}

const row = (r: { result: { current: { sa: ReturnType<typeof useSecureAccount> } } }, key: string) =>
  r.result.current.sa.methods.find((m) => m.key === key)!;

async function startTotp(r: Awaited<ReturnType<typeof signedIn>>) {
  r.client.enrollMfa.mockResolvedValue({
    data: {
      enrollment: { id: "enr_totp_new", method: "totp", verified: false },
      provisioning_uri: TOTP_URI,
      secret: TOTP_SECRET,
    },
    error: null,
  });
  await act(async () => {
    await r.result.current.sa.startEnroll("totp");
  });
}

describe("loading", () => {
  it("waits for the auth context to settle before fetching anything", () => {
    const { client, result } = setup();
    expect(result.current.sa.loading).toBe(true);
    expect(client.getAppData).not.toHaveBeenCalled();
    expect(client.listMfaMethods).not.toHaveBeenCalled();
  });

  it("signed out: loads app config only and reports nothing enrolled", async () => {
    const { client, result } = await signedOut();
    expect(client.getAppData).toHaveBeenCalledTimes(1);
    expect(client.listMfaMethods).not.toHaveBeenCalled();
    expect(result.current.sa.isAuthenticated).toBe(false);
    expect(result.current.sa.methods.every((m) => m.enrolled === false)).toBe(true);
    expect(result.current.sa.error).toBeNull();
  });

  it("signed in: loads config and enrollments and builds the rows", async () => {
    const r = await signedIn();
    expect(r.client.getAppData).toHaveBeenCalledTimes(1);
    expect(r.client.listMfaMethods).toHaveBeenCalledTimes(1);
    expect(r.result.current.sa.isAuthenticated).toBe(true);
    expect(r.result.current.sa.methods).toEqual([
      {
        key: "passkey",
        label: "Passkeys",
        description: "Sign in with biometrics or security key.",
        allowed: true,
        enrolled: false,
      },
      {
        key: "totp",
        label: "Authenticator App",
        description:
          "Use an app like Microsoft Authenticator, Google Authenticator, Authy, 1Password or Bitwarden.",
        allowed: true,
        enrolled: true,
        enrollmentId: "enr_totp_1",
      },
      {
        key: "sms",
        label: "SMS",
        description: "Receive a one-time code via text message.",
        allowed: true,
        // An unverified enrollment does not count.
        enrolled: false,
        enrollmentId: undefined,
      },
      {
        key: "email",
        label: "Email",
        description: "Receive a one-time code via email.",
        allowed: true,
        enrolled: false,
        enrollmentId: undefined,
      },
      {
        key: "backup_codes",
        label: "Backup Codes",
        description: "One-time recovery codes for when you lose access.",
        allowed: true,
        enrolled: true,
        count: 4,
      },
    ]);
  });

  it("re-runs the load when the user signs in later", async () => {
    const r = await signedOut({
      listMfaMethods: vi.fn(async () => ({ data: ENROLLED, error: null })),
    });
    act(() => r.client.emitSignedIn());
    await waitFor(() => expect(row(r, "totp").enrolled).toBe(true));
    expect(r.client.getAppData).toHaveBeenCalledTimes(2);
    expect(r.client.listMfaMethods).toHaveBeenCalledTimes(1);
  });

  it("surfaces a thrown config load as config_load_failed", async () => {
    const r = await signedOut({
      getAppData: vi.fn(async () => {
        throw new Error("fetch failed");
      }),
    });
    expect(r.result.current.sa.error).toEqual({ code: "config_load_failed", message: "fetch failed" });
    expect(r.result.current.sa.loading).toBe(false);
  });

  it("silently keeps stale enrollments when listMfaMethods returns an error", async () => {
    const r = await signedIn();
    r.client.listMfaMethods.mockResolvedValueOnce({ data: null, error: { message: "500" } });
    await act(async () => {
      await r.result.current.sa.refresh();
    });
    // Known limitation, tracked separately: only thrown errors are reported; a returned { error } leaves `error` null and the old rows in place.
    expect(r.result.current.sa.error).toBeNull();
    expect(row(r, "totp").enrolled).toBe(true);
  });
});

describe("allow-list", () => {
  it("allows only the methods in mfa_methods_allowed", async () => {
    const r = await signedIn({
      getAppData: vi.fn(async () => ({
        data: { passkeys_enabled: true, mfa_methods_allowed: ["totp"] },
        error: null,
      })),
    });
    const allowed = r.result.current.sa.methods.filter((m) => m.allowed).map((m) => m.key);
    expect(allowed).toEqual(["passkey", "totp"]);
  });

  it("treats a missing mfa_methods_allowed as nothing allowed", async () => {
    const r = await signedIn({
      getAppData: vi.fn(async () => ({ data: { passkeys_enabled: false }, error: null })),
    });
    expect(r.result.current.sa.methods.some((m) => m.allowed)).toBe(false);
  });

  it("disallows passkeys when passkeys_enabled is false", async () => {
    const r = await signedIn({
      getAppData: vi.fn(async () => ({ data: { passkeys_enabled: false, mfa_methods_allowed: [] }, error: null })),
    });
    expect(row(r, "passkey").allowed).toBe(false);
  });

  it("disallows passkeys when passkeys_enabled is missing (fails closed, SEC-40)", async () => {
    const r = await signedIn({
      getAppData: vi.fn(async () => ({ data: { mfa_methods_allowed: [] }, error: null })),
    });
    expect(row(r, "passkey").allowed).toBe(false);
  });

  it("disallows passkeys when app config fails to load (fails closed, SEC-40)", async () => {
    const r = await signedIn({
      getAppData: vi.fn(async () => ({ data: null, error: { message: "503" } })),
    });
    expect(row(r, "passkey").allowed).toBe(false);
    expect(row(r, "totp").allowed).toBe(false);
    // Known limitation, tracked separately: a returned { error } from getAppData is not reported in `error`.
    expect(r.result.current.sa.error).toBeNull();
  });

  it("never marks the passkey row as enrolled from real app data", async () => {
    const r = await signedIn();
    // Known limitation, tracked separately: passkey enrollment is read from appData._currentUserHasPasskey, which the SDK and API do not set.
    expect(row(r, "passkey").enrolled).toBe(false);
  });

  it("only reports the passkey as enrolled if appData carries _currentUserHasPasskey", async () => {
    const r = await signedIn({
      getAppData: vi.fn(async () => ({
        data: { passkeys_enabled: true, mfa_methods_allowed: [], _currentUserHasPasskey: true },
        error: null,
      })),
    });
    expect(row(r, "passkey").enrolled).toBe(true);
  });
});

describe("startEnroll guards", () => {
  it("rejects a method the app does not allow, without calling the client", async () => {
    const r = await signedIn({
      getAppData: vi.fn(async () => ({ data: { passkeys_enabled: true, mfa_methods_allowed: ["totp"] }, error: null })),
    });
    await act(async () => {
      await r.result.current.sa.startEnroll("sms");
    });
    expect(r.result.current.sa.error).toEqual({
      code: "method_not_allowed",
      message: "SMS is not enabled on this app.",
    });
    expect(r.result.current.sa.activeMethod).toBeNull();
    expect(r.client.enrollMfa).not.toHaveBeenCalled();
  });

  it("rejects an allowed method when signed out", async () => {
    const r = await signedOut();
    await act(async () => {
      await r.result.current.sa.startEnroll("totp");
    });
    expect(r.result.current.sa.error).toEqual({
      code: "not_authenticated",
      message: "Sign in to set up MFA.",
    });
    expect(r.client.enrollMfa).not.toHaveBeenCalled();
  });
});

describe("TOTP / SMS / email enrollment", () => {
  it("startEnroll(totp) sends { method } and exposes the one-shot secret", async () => {
    const r = await signedIn();
    const d = deferred<any>();
    r.client.enrollMfa.mockReturnValue(d.promise);
    let pending!: Promise<void>;
    act(() => {
      pending = r.result.current.sa.startEnroll("totp");
    });
    expect(r.result.current.sa.phase).toBe("enrolling");
    expect(r.result.current.sa.activeMethod).toBe("totp");
    expect(r.client.enrollMfa).toHaveBeenCalledWith({ method: "totp" });
    await act(async () => {
      d.resolve({
        data: { enrollment: { id: "enr_totp_new" }, provisioning_uri: TOTP_URI, secret: TOTP_SECRET },
        error: null,
      });
      await pending;
    });
    expect(r.result.current.sa.phase).toBe("pending_verify");
    expect(r.result.current.sa.provisioningUri).toBe(TOTP_URI);
    expect(r.result.current.sa.secret).toBe(TOTP_SECRET);
    expect(r.result.current.sa.error).toBeNull();
  });

  it("startEnroll(sms) forwards secret_data and name", async () => {
    const r = await signedIn();
    r.client.enrollMfa.mockResolvedValue({ data: { enrollment: { id: "enr_sms_new" } }, error: null });
    await act(async () => {
      await r.result.current.sa.startEnroll("sms", { secret_data: "+15555550100", name: "Work phone" });
    });
    expect(r.client.enrollMfa).toHaveBeenCalledWith({
      method: "sms",
      secret_data: "+15555550100",
      name: "Work phone",
    });
    expect(r.result.current.sa.phase).toBe("pending_verify");
    expect(r.result.current.sa.secret).toBeNull();
  });

  it("maps an enroll error to enrollment_failed", async () => {
    const r = await signedIn();
    r.client.enrollMfa.mockResolvedValue({ data: null, error: { message: "Phone invalid" } });
    await act(async () => {
      await r.result.current.sa.startEnroll("sms", { secret_data: "nope" });
    });
    expect(r.result.current.sa.error).toEqual({ code: "enrollment_failed", message: "Phone invalid" });
    expect(r.result.current.sa.phase).toBe("error");
  });

  it.each([
    ["a string error", { data: null, error: "plain string" }, "plain string"],
    ["an object without message", { data: null, error: { status: 422 } }, '{"status":422}'],
    ["no data and no error", { data: null, error: null }, "Unknown error"],
  ])("normalizes %s", async (_label, response, message) => {
    const r = await signedIn();
    r.client.enrollMfa.mockResolvedValue(response);
    await act(async () => {
      await r.result.current.sa.startEnroll("email");
    });
    expect(r.result.current.sa.error).toEqual({ code: "enrollment_failed", message });
  });

  it("maps a thrown enroll error to enrollment_failed", async () => {
    const r = await signedIn();
    r.client.enrollMfa.mockRejectedValue(new Error("socket hang up"));
    await act(async () => {
      await r.result.current.sa.startEnroll("totp");
    });
    expect(r.result.current.sa.error).toEqual({ code: "enrollment_failed", message: "socket hang up" });
    expect(r.result.current.sa.phase).toBe("error");
  });

  it("submitCode without a pending enrollment fails locally", async () => {
    const r = await signedIn();
    await act(async () => {
      await r.result.current.sa.submitCode("123456");
    });
    expect(r.result.current.sa.error).toEqual({ code: "verify_failed", message: "No enrollment in progress." });
    expect(r.result.current.sa.phase).toBe("idle");
    expect(r.client.verifyMfaEnrollment).not.toHaveBeenCalled();
  });

  it("submitCode verifies (enrollmentId, code), drops the secrets and refreshes", async () => {
    const r = await signedIn();
    await startTotp(r);
    r.client.verifyMfaEnrollment.mockResolvedValue({ data: { enrollment: { id: "enr_totp_new", verified: true } }, error: null });
    await act(async () => {
      await r.result.current.sa.submitCode("654321");
    });
    expect(r.client.verifyMfaEnrollment).toHaveBeenCalledWith("enr_totp_new", "654321");
    expect(r.result.current.sa.phase).toBe("verified");
    expect(r.result.current.sa.secret).toBeNull();
    expect(r.result.current.sa.provisioningUri).toBeNull();
    expect(r.client.listMfaMethods).toHaveBeenCalledTimes(2);
  });

  it("submitCode failure keeps the secret for a retry", async () => {
    const r = await signedIn();
    await startTotp(r);
    r.client.verifyMfaEnrollment.mockResolvedValue({ data: null, error: { message: "Invalid code" } });
    await act(async () => {
      await r.result.current.sa.submitCode("000000");
    });
    expect(r.result.current.sa.error).toEqual({ code: "verify_failed", message: "Invalid code" });
    expect(r.result.current.sa.phase).toBe("error");
    expect(r.result.current.sa.secret).toBe(TOTP_SECRET);
  });

  it("cancelEnroll collapses the row and drops the secrets", async () => {
    const r = await signedIn();
    await startTotp(r);
    act(() => r.result.current.sa.cancelEnroll());
    expect(r.result.current.sa.activeMethod).toBeNull();
    expect(r.result.current.sa.phase).toBe("idle");
    expect(r.result.current.sa.secret).toBeNull();
    expect(r.result.current.sa.provisioningUri).toBeNull();
    expect(r.result.current.sa.error).toBeNull();
    await act(async () => {
      await r.result.current.sa.submitCode("123456");
    });
    expect(r.result.current.sa.error?.code).toBe("verify_failed");
  });
});

describe("passkey and backup codes", () => {
  it("startEnroll(passkey) calls addDevice and ends verified", async () => {
    const r = await signedIn();
    await act(async () => {
      await r.result.current.sa.startEnroll("passkey");
    });
    expect(r.client.addDevice).toHaveBeenCalledWith();
    expect(r.result.current.sa.phase).toBe("verified");
    expect(r.result.current.sa.activeMethod).toBe("passkey");
    expect(r.client.getAppData).toHaveBeenCalledTimes(2);
  });

  it("maps an addDevice error to passkey_failed", async () => {
    const r = await signedIn();
    r.client.addDevice.mockResolvedValue({ data: null, error: { message: "NotAllowedError" } });
    await act(async () => {
      await r.result.current.sa.startEnroll("passkey");
    });
    expect(r.result.current.sa.error).toEqual({ code: "passkey_failed", message: "NotAllowedError" });
    expect(r.result.current.sa.phase).toBe("error");
  });

  it("refuses passkey enrollment when app config failed to load", async () => {
    const r = await signedIn({
      getAppData: vi.fn(async () => ({ data: null, error: { message: "503" } })),
    });
    await act(async () => {
      await r.result.current.sa.startEnroll("passkey");
    });
    expect(r.client.addDevice).not.toHaveBeenCalled();
    expect(r.result.current.sa.error).toEqual({
      code: "method_not_allowed",
      message: "Passkeys is not enabled on this app.",
    });
    expect(r.result.current.sa.activeMethod).toBeNull();
  });

  it("startEnroll(backup_codes) generates codes, exposes them once and clearBackupCodes drops them", async () => {
    const r = await signedIn();
    const codes = ["aaaa-1111", "bbbb-2222"];
    r.client.generateBackupCodes.mockResolvedValue({ data: { backup_codes: codes }, error: null });
    await act(async () => {
      await r.result.current.sa.startEnroll("backup_codes");
    });
    expect(r.client.generateBackupCodes).toHaveBeenCalledWith();
    expect(r.result.current.sa.backupCodes).toEqual(codes);
    expect(r.result.current.sa.phase).toBe("verified");
    expect(r.client.listMfaMethods).toHaveBeenCalledTimes(2);
    act(() => r.result.current.sa.clearBackupCodes());
    expect(r.result.current.sa.backupCodes).toBeNull();
  });

  it("maps a generate failure to backup_codes_failed", async () => {
    const r = await signedIn();
    r.client.generateBackupCodes.mockResolvedValue({ data: null, error: null });
    await act(async () => {
      await r.result.current.sa.startEnroll("backup_codes");
    });
    expect(r.result.current.sa.error).toEqual({ code: "backup_codes_failed", message: "Unknown error" });
    expect(r.result.current.sa.phase).toBe("error");
  });

  it("cancelEnroll clears backup codes too", async () => {
    const r = await signedIn();
    r.client.generateBackupCodes.mockResolvedValue({ data: { backup_codes: ["x-1"] }, error: null });
    await act(async () => {
      await r.result.current.sa.startEnroll("backup_codes");
    });
    expect(r.result.current.sa.backupCodes).toEqual(["x-1"]);
    act(() => r.result.current.sa.cancelEnroll());
    expect(r.result.current.sa.backupCodes).toBeNull();
    expect(r.result.current.sa.activeMethod).toBeNull();
    expect(r.result.current.sa.phase).toBe("idle");
  });
});

describe("removeMethod", () => {
  it("refuses passkey and backup codes with remove_failed", async () => {
    const r = await signedIn();
    await act(async () => {
      await r.result.current.sa.removeMethod("passkey");
    });
    expect(r.result.current.sa.error).toEqual({
      code: "remove_failed",
      message: "Passkey removal is per-credential; use the devices list.",
    });
    await act(async () => {
      await r.result.current.sa.removeMethod("backup_codes");
    });
    expect(r.result.current.sa.error).toEqual({
      code: "remove_failed",
      message: "Backup codes can't be revoked individually; regenerate to invalidate.",
    });
    expect(r.client.removeMfaMethod).not.toHaveBeenCalled();
  });

  it("removes an enrolled method by its enrollment id and refreshes", async () => {
    const r = await signedIn();
    r.client.removeMfaMethod.mockResolvedValue({ data: {}, error: null });
    await act(async () => {
      await r.result.current.sa.removeMethod("totp");
    });
    expect(r.client.removeMfaMethod).toHaveBeenCalledWith("enr_totp_1");
    expect(r.client.listMfaMethods).toHaveBeenCalledTimes(2);
    expect(r.result.current.sa.error).toBeNull();
  });

  it("maps a remove error to remove_failed and skips the refresh", async () => {
    const r = await signedIn();
    r.client.removeMfaMethod.mockResolvedValue({ data: null, error: { message: "Last factor" } });
    await act(async () => {
      await r.result.current.sa.removeMethod("totp");
    });
    expect(r.result.current.sa.error).toEqual({ code: "remove_failed", message: "Last factor" });
    expect(r.client.listMfaMethods).toHaveBeenCalledTimes(1);
  });

  it("is a silent no-op for a method with no verified enrollment", async () => {
    const r = await signedIn();
    await act(async () => {
      await r.result.current.sa.removeMethod("sms");
    });
    expect(r.client.removeMfaMethod).not.toHaveBeenCalled();
    expect(r.result.current.sa.error).toBeNull();
  });
});

describe("security", () => {
  const endSession: Array<[string, (c: any) => Promise<unknown> | void]> = [
    ["sign-out", (c) => c.signOut()],
    ["session expiry", (c) => c.emit(AUTH_CHANGE_EVENTS.SESSION_EXPIRED)],
  ];

  it.each(endSession)("drops the TOTP secret and enroll state on %s", async (_label, end) => {
    const r = await signedIn();
    await startTotp(r);
    expect(r.result.current.sa.secret).toBe(TOTP_SECRET);
    await act(async () => {
      await end(r.client);
    });
    await waitFor(() => expect(r.result.current.sa.isAuthenticated).toBe(false));
    expect(r.result.current.sa.secret).toBeNull();
    expect(r.result.current.sa.provisioningUri).toBeNull();
    expect(r.result.current.sa.activeMethod).toBeNull();
    expect(r.result.current.sa.phase).toBe("idle");
    // The pending enrollment id is gone too.
    await act(async () => {
      await r.result.current.sa.submitCode("123456");
    });
    expect(r.client.verifyMfaEnrollment).not.toHaveBeenCalled();
  });

  it.each(endSession)("drops plaintext backup codes on %s", async (_label, end) => {
    const r = await signedIn();
    r.client.generateBackupCodes.mockResolvedValue({ data: { backup_codes: ["code-1", "code-2"] }, error: null });
    await act(async () => {
      await r.result.current.sa.startEnroll("backup_codes");
    });
    expect(r.result.current.sa.backupCodes).toEqual(["code-1", "code-2"]);
    await act(async () => {
      await end(r.client);
    });
    await waitFor(() => expect(r.result.current.sa.isAuthenticated).toBe(false));
    expect(r.result.current.sa.backupCodes).toBeNull();
  });
});
