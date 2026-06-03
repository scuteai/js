// @ts-nocheck
"use client";

// Headless hook for the "Secure your account" experience — a unified screen
// that lists MFA methods enabled on the app (per dashboard config), shows
// which the user has already set up, and drives inline enrollment for one
// method at a time. Bring your own UI; this hook owns:
//
//   - the cross-method state (which methods are allowed, which enrolled)
//   - the single-active-method enrollment state machine
//     (idle → enrolling → pending_verify → verifying → verified)
//   - TOTP provisioning URI + secret surface (one-shot, dropped after verify)
//   - backup-codes plaintext surface (one-shot, dropped after `clearBackupCodes`)
//
// Why a stateful hook instead of pure primitives (compare useAlternatePhones,
// which is intentionally pure): the Vercel-style screen is one wizard with
// up to five rows that share a single "currently enrolling" slot. Pushing
// that coordination into the integrator's component reproduces ~80 lines of
// duplicated state-machine boilerplate per consumer. Owning it here means
// the JSX is just `<Row for={m} {...secureAccount.bind(m)} />`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useScuteClient } from "@scute/react-hooks";

export type SecureMethodKey =
  | "passkey"
  | "totp"
  | "sms"
  | "email"
  | "backup_codes";

export type SecureMethod = {
  key: SecureMethodKey;
  /** Human-readable label, e.g. "Authenticator App". */
  label: string;
  /** One-line description an integrator can render under the label. */
  description: string;
  /** True if the app's dashboard config permits this method. */
  allowed: boolean;
  /** True if the current user has an active enrollment for this method. */
  enrolled: boolean;
  /** Backup-codes-specific: number of unused codes available. */
  count?: number;
  /** Enrollment row id (only present once enrolled, for `remove`). */
  enrollmentId?: string;
};

export type EnrollPhase =
  | "idle"
  | "enrolling"
  | "pending_verify"
  | "verifying"
  | "verified"
  | "error";

export type SecureAccountError = {
  code:
    | "not_authenticated"
    | "method_not_allowed"
    | "enrollment_failed"
    | "verify_failed"
    | "remove_failed"
    | "passkey_failed"
    | "backup_codes_failed"
    | "config_load_failed"
    | "unknown";
  message: string;
};

export type UseSecureAccountResult = {
  /** Per-method rows, ordered passkey → totp → sms → email → backup_codes. */
  methods: SecureMethod[];
  /** True while the initial list/config load is in flight. */
  loading: boolean;
  /** True if the user is not signed in. The hook still returns the method
   * list (with `enrolled: false` for everything) so the integrator can
   * render the screen and show a "sign in to set up MFA" affordance. */
  isAuthenticated: boolean;

  // --- Inline enrollment state machine -----------------------------------

  /** Method that's currently being enrolled inline, or null if collapsed. */
  activeMethod: SecureMethodKey | null;
  /** Where in the per-method state machine we are. */
  phase: EnrollPhase;
  /** Last error from any action; cleared on the next successful action. */
  error: SecureAccountError | null;

  // --- TOTP-specific surface (only relevant while activeMethod=="totp"
  //     and phase=="pending_verify") --------------------------------------

  /** otpauth:// URI for QR rendering. Auto-cleared after `verified`. */
  provisioningUri: string | null;
  /** Base32 manual-entry secret. Auto-cleared after `verified`. */
  secret: string | null;

  // --- Backup-codes-specific surface (only relevant after backup_codes
  //     enrolled). Plaintext is one-shot — call `clearBackupCodes()` once
  //     the user has saved them. ------------------------------------------

  backupCodes: string[] | null;

  // --- Actions ------------------------------------------------------------

  /** Begin enrolling a method. For passkey, fires WebAuthn immediately and
   * resolves with phase=`verified` on success. For totp/sms/email, transitions
   * to `pending_verify` so the integrator can prompt for the code. For
   * backup_codes, generates the codes (placed on `backupCodes`) and resolves
   * with phase=`verified`. */
  startEnroll: (
    key: SecureMethodKey,
    opts?: { secret_data?: string; name?: string }
  ) => Promise<void>;

  /** Submit a verification code (only valid for totp/sms/email while
   * phase=="pending_verify"). Transitions to `verified` on success. */
  submitCode: (code: string) => Promise<void>;

  /** Abort the inline enrollment and return to idle. Does NOT delete a
   * server-side row — if the user got partway and bailed, the next
   * startEnroll for the same method will reset the stale row. */
  cancelEnroll: () => void;

  /** Remove an enrolled method. */
  removeMethod: (key: SecureMethodKey) => Promise<void>;

  /** Clear the plaintext backup-codes from React state. Call this after the
   * user confirms they've saved them. */
  clearBackupCodes: () => void;

  /** Force a re-read of app config + enrolled methods. Auto-runs on mount. */
  refresh: () => Promise<void>;
};

// --- Static method metadata ------------------------------------------------
//
// Centralised so the integrator can render labels/descriptions without
// having to maintain a parallel mapping. Order is the recommended display
// order (strongest passwordless factor first, recovery codes last).

const METHOD_META: Record<SecureMethodKey, { label: string; description: string }> = {
  passkey: {
    label: "Passkeys",
    description: "Sign in with biometrics or security key.",
  },
  totp: {
    label: "Authenticator App",
    description:
      "Use an app like Microsoft Authenticator, Google Authenticator, Authy, 1Password or Bitwarden.",
  },
  sms: {
    label: "SMS",
    description: "Receive a one-time code via text message.",
  },
  email: {
    label: "Email",
    description: "Receive a one-time code via email.",
  },
  backup_codes: {
    label: "Backup Codes",
    description: "One-time recovery codes for when you lose access.",
  },
};

const METHOD_ORDER: SecureMethodKey[] = [
  "passkey",
  "totp",
  "sms",
  "email",
  "backup_codes",
];

// --- Error normalization ---------------------------------------------------
//
// The Scute API returns errors in a few shapes (the wretch wrappers, the
// backend's `error` strings, raw thrown errors). Collapse them into the
// shape the integrator wants to consume.

function toError(
  code: SecureAccountError["code"],
  err: unknown
): SecureAccountError {
  if (!err) return { code, message: "Unknown error" };
  if (typeof err === "string") return { code, message: err };
  const m = (err as any).message;
  if (typeof m === "string") return { code, message: m };
  try {
    return { code, message: JSON.stringify(err) };
  } catch {
    return { code, message: "Unknown error" };
  }
}

export function useSecureAccount(): UseSecureAccountResult {
  const client = useScuteClient();
  // Source of truth for "is the user signed in" — the auth context already
  // tracks this from session events, so we don't have to infer it from
  // whether `/mfa/methods` returned data (which conflates network errors
  // with sign-in state).
  const { isAuthenticated: authedFromContext, isLoading: authLoading } = useAuth();

  const [appData, setAppData] = useState<any>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [backupCodesAvailable, setBackupCodesAvailable] = useState(0);
  const [loading, setLoading] = useState(true);

  const [activeMethod, setActiveMethod] = useState<SecureMethodKey | null>(null);
  const [phase, setPhase] = useState<EnrollPhase>("idle");
  const [error, setError] = useState<SecureAccountError | null>(null);
  const [provisioningUri, setProvisioningUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pendingEnrollmentId, setPendingEnrollmentId] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  // StrictMode-safe: drop async writes after unmount so a slow fetch doesn't
  // set state on a stale instance.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // App config — always available; powers the row visibility logic.
      const cfg = await client.getAppData();
      if (cfg?.data && mountedRef.current) setAppData(cfg.data);

      // MFA methods — only attempt while signed in. If the auth context is
      // still loading we'll re-run when it settles via the effect below.
      if (authedFromContext) {
        const list = await client.listMfaMethods();
        if (!mountedRef.current) return;
        if (list?.data) {
          setEnrollments(list.data.methods ?? []);
          setBackupCodesAvailable(list.data.backup_codes_available ?? 0);
        }
      } else {
        setEnrollments([]);
        setBackupCodesAvailable(0);
      }
    } catch (e) {
      if (mountedRef.current) setError(toError("config_load_failed", e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [client, authedFromContext]);

  // Re-run refresh whenever sign-in state changes (also covers initial mount).
  useEffect(() => {
    if (authLoading) return;
    refresh();
  }, [authLoading, refresh]);

  // --- Derived: per-method rows ------------------------------------------
  //
  // Reads the app's dashboard-configured allow-list and the user's current
  // enrollments to build the row state. Passkey is its own column on the
  // App model (`passkeys_enabled`), not part of `mfa_methods_allowed`.

  const methods: SecureMethod[] = useMemo(() => {
    const allowed: string[] = appData?.mfa_methods_allowed ?? [];
    const passkeysOn = appData?.passkeys_enabled !== false;

    return METHOD_ORDER.map<SecureMethod | null>((key) => {
      let isAllowed = false;
      if (key === "passkey") {
        isAllowed = passkeysOn;
      } else {
        isAllowed = allowed.includes(key);
      }

      if (key === "passkey") {
        // Passkey enrollment is signalled by the existence of any credential
        // on the AppUser. Newer SDKs expose this via getCurrentUser, but the
        // most reliable signal we have here is whether the session payload
        // surfaced credentials. Best-effort.
        const enrolled = !!(appData as any)?._currentUserHasPasskey;
        return {
          key,
          ...METHOD_META[key],
          allowed: isAllowed,
          enrolled,
        };
      }
      if (key === "backup_codes") {
        return {
          key,
          ...METHOD_META[key],
          allowed: isAllowed,
          enrolled: backupCodesAvailable > 0,
          count: backupCodesAvailable,
        };
      }
      const match = enrollments.find((e: any) => e.method === key && e.verified);
      return {
        key,
        ...METHOD_META[key],
        allowed: isAllowed,
        enrolled: !!match,
        enrollmentId: match?.id,
      };
    }).filter(Boolean) as SecureMethod[];
  }, [appData, enrollments, backupCodesAvailable]);

  // --- Actions ----------------------------------------------------------

  const startEnroll = useCallback(
    async (
      key: SecureMethodKey,
      opts?: { secret_data?: string; name?: string }
    ) => {
      setError(null);

      // Guard: method must be enabled on the app.
      const row = methods.find((m) => m.key === key);
      if (!row?.allowed) {
        setError({
          code: "method_not_allowed",
          message: `${METHOD_META[key].label} is not enabled on this app.`,
        });
        return;
      }
      if (!authedFromContext) {
        setError({
          code: "not_authenticated",
          message: "Sign in to set up MFA.",
        });
        return;
      }

      setActiveMethod(key);
      setPhase("enrolling");
      setProvisioningUri(null);
      setSecret(null);
      setPendingEnrollmentId(null);
      setBackupCodes(null);

      try {
        if (key === "passkey") {
          const { error: err } = await client.addDevice();
          if (err) {
            setError(toError("passkey_failed", err));
            setPhase("error");
            return;
          }
          setPhase("verified");
          await refresh();
          return;
        }

        if (key === "backup_codes") {
          const { data, error: err } = await client.generateBackupCodes();
          if (err || !data) {
            setError(toError("backup_codes_failed", err));
            setPhase("error");
            return;
          }
          setBackupCodes(data.backup_codes ?? []);
          setPhase("verified");
          await refresh();
          return;
        }

        // totp / sms / email
        const params: any = { method: key };
        if (opts?.secret_data) params.secret_data = opts.secret_data;
        if (opts?.name) params.name = opts.name;
        const { data, error: err } = await client.enrollMfa(params);
        if (err || !data) {
          setError(toError("enrollment_failed", err));
          setPhase("error");
          return;
        }
        setPendingEnrollmentId(data.enrollment?.id ?? null);
        setProvisioningUri(data.provisioning_uri ?? null);
        setSecret(data.secret ?? null);
        setPhase("pending_verify");
      } catch (e) {
        setError(toError("enrollment_failed", e));
        setPhase("error");
      }
    },
    [client, authedFromContext, methods, refresh]
  );

  const submitCode = useCallback(
    async (code: string) => {
      if (!pendingEnrollmentId) {
        setError({
          code: "verify_failed",
          message: "No enrollment in progress.",
        });
        return;
      }
      setPhase("verifying");
      setError(null);
      try {
        const { error: err } = await client.verifyMfaEnrollment(
          pendingEnrollmentId,
          code
        );
        if (err) {
          setError(toError("verify_failed", err));
          setPhase("error");
          return;
        }
        // Secrets are one-shot — drop them so a stale render can't expose
        // the QR after the user proved possession.
        setProvisioningUri(null);
        setSecret(null);
        setPhase("verified");
        await refresh();
      } catch (e) {
        setError(toError("verify_failed", e));
        setPhase("error");
      }
    },
    [client, pendingEnrollmentId, refresh]
  );

  const cancelEnroll = useCallback(() => {
    setActiveMethod(null);
    setPhase("idle");
    setProvisioningUri(null);
    setSecret(null);
    setPendingEnrollmentId(null);
    setError(null);
  }, []);

  const removeMethod = useCallback(
    async (key: SecureMethodKey) => {
      setError(null);
      try {
        if (key === "passkey") {
          // Passkey removal is per-credential and lives on a different
          // endpoint (/devices/:id). We don't try to single-shot remove
          // "all passkeys" from here — integrators should expose a per-key
          // affordance for that. For consistency, surface a clear error.
          setError({
            code: "remove_failed",
            message:
              "Passkey removal is per-credential; use the devices list.",
          });
          return;
        }
        if (key === "backup_codes") {
          // No remove endpoint; regenerate-with-zero would be wrong. Tell
          // the integrator that the only way to "remove" backup codes is to
          // regenerate or let them be consumed.
          setError({
            code: "remove_failed",
            message:
              "Backup codes can't be revoked individually; regenerate to invalidate.",
          });
          return;
        }
        const row = methods.find((m) => m.key === key);
        if (!row?.enrollmentId) return;
        const { error: err } = await client.removeMfaMethod(row.enrollmentId);
        if (err) {
          setError(toError("remove_failed", err));
          return;
        }
        await refresh();
      } catch (e) {
        setError(toError("remove_failed", e));
      }
    },
    [client, methods, refresh]
  );

  const clearBackupCodes = useCallback(() => setBackupCodes(null), []);

  return {
    methods,
    loading,
    isAuthenticated: authedFromContext,
    activeMethod,
    phase,
    error,
    provisioningUri,
    secret,
    backupCodes,
    startEnroll,
    submitCode,
    cancelEnroll,
    removeMethod,
    clearBackupCodes,
    refresh,
  };
}
