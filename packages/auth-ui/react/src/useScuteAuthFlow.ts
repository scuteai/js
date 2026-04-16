// @ts-nocheck
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AUTH_CHANGE_EVENTS, useScuteClient, useAuth } from "@scute/react-hooks";

/**
 * Auth flow views — represents the current step in the auth lifecycle.
 */
export type AuthFlowView =
  | "loading"
  | "login"
  | "magic_pending"
  | "magic_verifying"
  | "otp_input"
  | "webauthn_verify"
  | "webauthn_register"
  | "webauthn_register_success"
  | "error"
  | "authenticated";

/**
 * useScuteAuthFlow — headless auth flow hook.
 *
 * Handles the complete Scute auth lifecycle with zero UI opinions.
 * The consuming component renders whatever it wants based on `view`.
 *
 * Features:
 * - Email/phone sign in (signInOrUp — auto-detects passkey, magic link, or OTP)
 * - Magic link polling (auto-completes when user clicks the link)
 * - Magic link callback processing (when user lands with ?sct_magic=)
 * - Passkey registration prompt (always offered after magic link verification)
 * - Passkey login on return visits
 * - OTP verification
 * - MFA support (future)
 *
 * @example
 * ```tsx
 * const auth = useScuteAuthFlow();
 *
 * if (auth.view === "login") return <LoginForm onSubmit={auth.submitIdentifier} />;
 * if (auth.view === "magic_pending") return <CheckEmail email={auth.identifier} />;
 * if (auth.view === "webauthn_register") return <RegisterPasskey onRegister={auth.registerPasskey} onSkip={auth.skipPasskey} />;
 * if (auth.view === "authenticated") return <App />;
 * ```
 */
export function useScuteAuthFlow() {
  const scuteClient = useScuteClient();
  const { isAuthenticated, isLoading, user, signOut } = useAuth();

  const [view, setView] = useState<AuthFlowView>("loading");
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [authPayload, setAuthPayload] = useState<any>(null);
  const [magicLinkId, setMagicLinkId] = useState<string | null>(null);

  const initRef = useRef(false);
  const magicVerifyRef = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 1. Initialize SDK + detect magic link in URL ──
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      try { await scuteClient["_initialize"](); } catch {}

      const magicToken = scuteClient.getMagicLinkToken();
      if (magicToken) {
        setView("magic_verifying");
      } else if (!isAuthenticated) {
        setView("login");
      }
    })();
  }, [scuteClient]);

  // ── 2. Listen to SDK auth events ──
  useEffect(() => {
    const unsubscribe = scuteClient.onAuthStateChange((event: string) => {
      if (event === AUTH_CHANGE_EVENTS.SIGNED_IN && view !== "webauthn_register" && view !== "webauthn_register_success") {
        setView("authenticated");
      }
      if (event === AUTH_CHANGE_EVENTS.MAGIC_PENDING || event === AUTH_CHANGE_EVENTS.MAGIC_NEW_DEVICE_PENDING) {
        setView("magic_pending");
      }
      if (event === AUTH_CHANGE_EVENTS.WEBAUTHN_VERIFY_START) {
        setView("webauthn_verify");
      }
      if (event === AUTH_CHANGE_EVENTS.OTP_PENDING || event === AUTH_CHANGE_EVENTS.OTP_NEW_DEVICE_PENDING) {
        setView("otp_input");
      }
    });
    return () => unsubscribe();
  }, [scuteClient, view]);

  // ── 3. Process magic link from URL ──
  useEffect(() => {
    if (view !== "magic_verifying" || magicVerifyRef.current) return;
    magicVerifyRef.current = true;

    const magicToken = scuteClient.getMagicLinkToken();
    if (!magicToken) { setView("login"); return; }

    (async () => {
      const { data, error: verifyError } = await scuteClient.verifyMagicLinkToken(magicToken);

      // Clean URL
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("sct_magic");
        url.searchParams.delete("sct_sk");
        window.history.replaceState({}, "", url.toString());
      }

      if (verifyError) {
        setError(verifyError.message || "Invalid or expired link");
        setView("error");
        return;
      }

      // Always offer passkey registration after magic link verify
      // (same as Scute dashboard behavior)
      const shouldSkip = typeof window !== "undefined" && new URL(window.location.href).searchParams.get("sct_sk");
      if (!shouldSkip && data?.authPayload) {
        setAuthPayload(data.authPayload);
        setView("webauthn_register");
      } else if (data?.authPayload) {
        await scuteClient.signInWithTokenPayload(data.authPayload);
      }
    })();
  }, [view, scuteClient]);

  // ── 4. Poll magic link status ──
  useEffect(() => {
    if (view !== "magic_pending" || !magicLinkId) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    pollingRef.current = setInterval(async () => {
      const { data, error } = await scuteClient.getMagicLinkStatus(magicLinkId);
      if (!error && data) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        await scuteClient.signInWithTokenPayload(data);
      }
    }, 2000);

    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [view, magicLinkId, scuteClient]);

  // ── 5. Track authenticated state ──
  useEffect(() => {
    if (isAuthenticated && view !== "webauthn_register" && view !== "webauthn_register_success" && view !== "magic_verifying") {
      setView("authenticated");
    }
  }, [isAuthenticated]);

  // ── Actions ──

  const submitIdentifier = useCallback(async (id?: string) => {
    const email = id || identifier;
    if (!email || submitting) return;
    setIdentifier(email);
    setSubmitting(true);
    setError(null);

    try {
      const { data, error: signError } = await scuteClient.signInOrUp(email);
      if (signError) {
        setError(signError.message);
        return;
      }
      if (!data) {
        // WebAuthn succeeded — SIGNED_IN event will fire
      } else if ("magic_link" in data) {
        setMagicLinkId(data.magic_link.id);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to sign in");
    } finally {
      setSubmitting(false);
    }
  }, [identifier, submitting, scuteClient]);

  const submitOtp = useCallback(async (code: string) => {
    setError(null);
    try {
      const result = await scuteClient.verifyOtp(code, identifier);
      if (result?.error) setError(result.error.message);
      if (result?.data?.authPayload) {
        setAuthPayload(result.data.authPayload);
        setView("webauthn_register");
      }
    } catch (err: any) {
      setError(err?.message || "Invalid code");
    }
  }, [identifier, scuteClient]);

  const registerPasskey = useCallback(async () => {
    setError(null);
    try {
      if (authPayload) {
        const { error: signInError } = await scuteClient.signInWithTokenPayload(authPayload);
        if (signInError) { setError(signInError.message); return; }
      }
      const { error: addError } = await scuteClient.addDevice();
      if (addError) { setError(addError.message); return; }
      setView("webauthn_register_success");
      setTimeout(() => setView("authenticated"), 800);
    } catch (err: any) {
      setError(err?.message || "Failed to register passkey");
    }
  }, [authPayload, scuteClient]);

  const skipPasskey = useCallback(async () => {
    try {
      if (authPayload) await scuteClient.signInWithTokenPayload(authPayload);
    } catch {}
    setView("authenticated");
  }, [authPayload, scuteClient]);

  const retry = useCallback(() => {
    setError(null);
    setIdentifier("");
    setView("login");
  }, []);

  return {
    // State
    view,
    identifier,
    error,
    submitting,
    isAuthenticated: isAuthenticated || view === "authenticated",
    isLoading,
    user,

    // Actions
    setIdentifier,
    submitIdentifier,
    submitOtp,
    registerPasskey,
    skipPasskey,
    retry,
    signOut,
  };
}
