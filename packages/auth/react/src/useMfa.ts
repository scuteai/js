"use client";

// Headless React hooks for MFA: enrollment, verification (step-up), factor
// management, and backup-code generation. Thin React-state wrappers over the
// MFA methods on ScuteClient; they manage transitions, never own auth tokens
// (the underlying client does that).
//
// Why these exist as a layer instead of using `client.post()` directly:
//   1. The HTTP methods on ScuteClient are `protected`. Consumers calling
//      them needed `// @ts-nocheck` tricks; the kitchen-sink demonstrably
//      drifted out of sync (three wrong URLs that 404'd silently).
//   2. Centralises the state machine each MFA UI needs (idle → pending_verify
//      → verified, idle → verifying → switched, etc.).
//   3. Mirrors the Stytch/Auth0 hook ergonomic without forking their SDK.

import { useCallback, useEffect, useRef, useState } from "react";
import { useScuteClient } from "./AuthContext";

// --- Shared types ---------------------------------------------------------

export type MfaMethod = "totp" | "sms" | "email" | "backup_code" | "push";

export type MfaEnrollment = {
  id: string;
  method: string;
  name: string | null;
  verified: boolean;
  is_default: boolean;
  last_used_at: string | null;
  created_at: string;
};

export type EnrollMfaParams =
  | { method: "totp"; name?: string }
  | { method: "sms"; secret_data: string; name?: string }
  | { method: "email"; secret_data?: string; name?: string };

type ScuteError = { message: string; code?: string } | null;

// --- useEnrollMfa ---------------------------------------------------------

export type EnrollMfaState =
  | "idle"
  | "enrolling"
  | "pending_verify"
  | "verifying"
  | "verified"
  | "error";

/**
 * Enroll a new MFA method on the current user. Drives the full enroll →
 * verify state machine; for TOTP also exposes the `otpauth://` URI + the
 * base32 secret (both shown once, then forgotten on reset).
 *
 * Usage:
 *
 *     const { enroll, verify, state, provisioningUri, secret, enrollment } = useEnrollMfa();
 *     await enroll({ method: "totp" });           // → state: "pending_verify"
 *     // user scans the QR with provisioningUri, enters the 6-digit code
 *     await verify(code);                          // → state: "verified"
 */
export function useEnrollMfa() {
  const client = useScuteClient();
  const [state, setState] = useState<EnrollMfaState>("idle");
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [provisioningUri, setProvisioningUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<ScuteError>(null);

  const enroll = useCallback(
    async (params: EnrollMfaParams) => {
      setError(null);
      setState("enrolling");
      const { data, error: err } = await client.enrollMfa(params as any);
      if (err || !data) {
        setError((err as any) ?? { message: "Enrollment failed" });
        setState("error");
        return { data: null, error: err ?? { message: "Enrollment failed" } };
      }
      setEnrollment(data.enrollment as MfaEnrollment);
      setProvisioningUri(data.provisioning_uri ?? null);
      setSecret(data.secret ?? null);
      setState("pending_verify");
      return { data, error: null };
    },
    [client]
  );

  const verify = useCallback(
    async (code: string) => {
      if (!enrollment) {
        const e = { message: "No enrollment in progress" };
        setError(e);
        return { data: null, error: e };
      }
      setError(null);
      setState("verifying");
      const { data, error: err } = await client.verifyMfaEnrollment(
        enrollment.id,
        code
      );
      if (err || !data) {
        setError((err as any) ?? { message: "Verification failed" });
        setState("error");
        return {
          data: null,
          error: err ?? { message: "Verification failed" },
        };
      }
      setEnrollment(data.enrollment as MfaEnrollment);
      // Secrets are one-shot. Once verified, drop them so a stale render
      // can't leak the QR after the user proved possession.
      setProvisioningUri(null);
      setSecret(null);
      setState("verified");
      return { data, error: null };
    },
    [client, enrollment]
  );

  const reset = useCallback(() => {
    setState("idle");
    setEnrollment(null);
    setProvisioningUri(null);
    setSecret(null);
    setError(null);
  }, []);

  return {
    state,
    enrollment,
    provisioningUri,
    secret,
    error,
    enroll,
    verify,
    reset,
  };
}

// --- useMfaVerify ---------------------------------------------------------

export type MfaVerifyState = "idle" | "verifying" | "verified" | "error";

/**
 * Verify a pending MFA challenge during sign-in (the second-factor step
 * after primary auth has produced a `pendingMfaChallenge` on the client).
 * Supports switching method mid-flow (e.g. "use backup code instead") and
 * resending OTP-style codes.
 */
export function useMfaVerify() {
  const client = useScuteClient();
  // Snapshot the pending challenge so we render the same instance the user
  // started verifying against, even if a stale switchMethod race finishes.
  const [pendingChallenge, setPendingChallenge] = useState(
    client.pendingMfaChallenge
  );
  const [state, setState] = useState<MfaVerifyState>("idle");
  const [error, setError] = useState<ScuteError>(null);

  useEffect(() => {
    setPendingChallenge(client.pendingMfaChallenge);
  }, [client]);

  const challengeToken =
    (pendingChallenge as any)?.mfa_challenge?.token ??
    (pendingChallenge as any)?.token ??
    null;

  const verify = useCallback(
    async (code: string) => {
      if (!challengeToken) {
        const e = { message: "No pending MFA challenge" };
        setError(e);
        return { data: null, error: e };
      }
      setError(null);
      setState("verifying");
      const result = await client.verifyMfaChallenge(challengeToken, code);
      if (result.error) {
        setError(result.error as any);
        setState("error");
        return result;
      }
      setState("verified");
      return result;
    },
    [client, challengeToken]
  );

  const switchMethod = useCallback(
    async (method: MfaMethod) => {
      if (!challengeToken) {
        const e = { message: "No pending MFA challenge" };
        setError(e);
        return { data: null, error: e };
      }
      setError(null);
      const result = await client.switchMfaMethod(challengeToken, method);
      setPendingChallenge(client.pendingMfaChallenge);
      setState("idle");
      return result;
    },
    [client, challengeToken]
  );

  const resend = useCallback(async () => {
    if (!challengeToken) {
      const e = { message: "No pending MFA challenge" };
      setError(e);
      return { data: null, error: e };
    }
    return client.resendChallenge(challengeToken);
  }, [client, challengeToken]);

  const cancel = useCallback(async () => {
    if (!challengeToken) return { data: null, error: null };
    const result = await client.cancelChallenge(challengeToken);
    setPendingChallenge(null);
    setState("idle");
    return result;
  }, [client, challengeToken]);

  return {
    pendingChallenge,
    challengeToken,
    state,
    error,
    verify,
    switchMethod,
    resend,
    cancel,
  };
}

// --- useFactorList --------------------------------------------------------

/**
 * Lists the current user's enrolled MFA factors, with operations to remove
 * one or promote one to default. Auto-loads on mount; call `refresh()`
 * after any external change. Returns an empty list (not an error) while
 * unauthenticated so callers don't have to special-case loading order.
 */
export function useFactorList() {
  const client = useScuteClient();
  const [factors, setFactors] = useState<MfaEnrollment[]>([]);
  const [backupCodesAvailable, setBackupCodesAvailable] = useState(0);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ScuteError>(null);

  // Guard against state updates after unmount when refresh races with the
  // hook teardown (StrictMode dev double-render).
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
    const { data, error: err } = await client.listMfaMethods();
    if (!mountedRef.current) return { data: null, error: null };
    setLoading(false);
    if (err || !data) {
      setError((err as any) ?? null);
      return { data: null, error: err ?? null };
    }
    setFactors((data.methods as MfaEnrollment[]) ?? []);
    setBackupCodesAvailable(data.backup_codes_available ?? 0);
    setMfaEnabled(!!data.mfa_enabled);
    return { data, error: null };
  }, [client]);

  const remove = useCallback(
    async (id: string) => {
      const { data, error: err } = await client.removeMfaMethod(id);
      if (!err) await refresh();
      return { data, error: err };
    },
    [client, refresh]
  );

  const setDefault = useCallback(
    async (id: string) => {
      const { data, error: err } = await client.setDefaultMfaMethod(id);
      if (!err) await refresh();
      return { data, error: err };
    },
    [client, refresh]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    factors,
    backupCodesAvailable,
    mfaEnabled,
    loading,
    error,
    refresh,
    remove,
    setDefault,
  };
}

// --- useBackupCodes -------------------------------------------------------

/**
 * Generate a fresh batch of backup codes. The returned `codes` array is
 * the plaintext — show it once, let the user save it, then call `clear()`
 * to drop it from React state. Subsequent renders will show `null` until
 * `generate()` runs again.
 */
export function useBackupCodes() {
  const client = useScuteClient();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ScuteError>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await client.generateBackupCodes();
    setLoading(false);
    if (err || !data) {
      setError((err as any) ?? null);
      return { data: null, error: err ?? null };
    }
    setCodes(data.backup_codes ?? []);
    return { data, error: null };
  }, [client]);

  const clear = useCallback(() => setCodes(null), []);

  return { codes, loading, error, generate, clear };
}
