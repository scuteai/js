"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AUTH_CHANGE_EVENTS, useScuteClient, useAuth } from "@scute/react-hooks";
import { scrubAuthTokensFromUrl } from "@scute/js-core";

// Magic link status polling: one request at a time, every 2s, for at most 10
// minutes. The API does not return the link's expiry, so this is a fixed cap.
const MAGIC_LINK_POLL_INTERVAL_MS = 2000;
const MAGIC_LINK_POLL_TIMEOUT_MS = 10 * 60 * 1000;
const MAGIC_LINK_TIMEOUT_MESSAGE = "The sign-in link timed out. Please try again.";

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
  | "mfa_verify"
  | "mfa_enroll"
  | "mfa_enroll_suggest"
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
  const [mfaChallenge, setMfaChallenge] = useState<any>(null);
  const [mfaAvailableMethods, setMfaAvailableMethods] = useState<string[]>([]);
  const [mfaGracePeriod, setMfaGracePeriod] = useState(false);
  const [mfaGraceDaysRemaining, setMfaGraceDaysRemaining] = useState<number | undefined>();
  const [pendingAuthPayload, setPendingAuthPayload] = useState<any>(null);

  const initRef = useRef(false);
  const magicVerifyRef = useRef(false);
  // A ref, not the `submitting` state, so two submits in the same tick send one request.
  const submittingRef = useRef(false);
  // The auth payload already exchanged for a session, so a retry or a skip
  // after registerPasskey signed in does not sign in with it again.
  const exchangedPayloadRef = useRef<any>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while the verified payload is exchanged for a session just before
  // the passkey offer, so the sign-in events don't move the flow on.
  const offeringPasskeyRef = useRef(false);
  const isAuthenticatedRef = useRef(isAuthenticated);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => () => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
  }, []);

  // Helper to set all MFA state from a response
  const handleMfaResponse = useCallback((data: any) => {
    setMfaChallenge(data.mfaChallenge);
    setMfaAvailableMethods(data.availableMethods || []);
    setMfaGracePeriod(!!data.mfaGracePeriod);
    setMfaGraceDaysRemaining(data.mfaGraceDaysRemaining);
  }, []);

  // Show the passkey offer with the user already signed in. The payload is
  // exchanged right away because server-side sign-in (the Next.js handler)
  // only accepts a freshly issued access token; holding it until the user
  // clicks would fail after 30 seconds.
  const offerPasskey = useCallback(async (payload: any) => {
    offeringPasskeyRef.current = true;
    setAuthPayload(payload);
    setView("webauthn_register");
    try {
      const result = await scuteClient.signInWithTokenPayload(payload);
      if (result?.error) {
        setError(result.error.message || "Sign-in failed");
      } else {
        exchangedPayloadRef.current = payload;
      }
    } catch (err: any) {
      setError(err?.message || "Sign-in failed");
    } finally {
      offeringPasskeyRef.current = false;
    }
  }, [scuteClient]);

  // The session ended: forget everything tied to it and start over at login.
  const resetAfterSignOut = useCallback(() => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    exchangedPayloadRef.current = null;
    setAuthPayload(null);
    setPendingAuthPayload(null);
    setMagicLinkId(null);
    setMfaChallenge(null);
    setMfaAvailableMethods([]);
    setMfaGracePeriod(false);
    setMfaGraceDaysRemaining(undefined);
    setError(null);
    setIdentifier("");
    setView("login");
  }, []);

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
      if (event === AUTH_CHANGE_EVENTS.SIGNED_OUT || event === AUTH_CHANGE_EVENTS.SESSION_EXPIRED) {
        // While the SDK initializes or a link is being verified, that step
        // picks the next view. An expiry while this flow had no session is a
        // stale session from an earlier visit and must not drop a sign-in in
        // progress; a sign-out always resets.
        if (view === "loading" || view === "magic_verifying") return;
        if (event === AUTH_CHANGE_EVENTS.SESSION_EXPIRED && !isAuthenticatedRef.current) return;
        resetAfterSignOut();
        return;
      }
      if (offeringPasskeyRef.current &&
          (event === AUTH_CHANGE_EVENTS.SIGNED_IN || event === AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_SUGGESTED)) {
        return;
      }
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
      if (event === AUTH_CHANGE_EVENTS.MFA_REQUIRED) {
        setView("mfa_verify");
      }
      if (event === AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_REQUIRED) {
        setView("mfa_enroll");
      }
      if (event === AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_SUGGESTED) {
        setView("mfa_enroll_suggest");
      }
      // Only with a live session; otherwise SIGNED_IN moves the flow on.
      if (event === AUTH_CHANGE_EVENTS.MFA_VERIFIED && isAuthenticatedRef.current) {
        setView("authenticated");
      }
    });
    return () => unsubscribe();
  }, [scuteClient, view, resetAfterSignOut]);

  // ── 3. Process magic link from URL ──
  useEffect(() => {
    if (view !== "magic_verifying" || magicVerifyRef.current) return;
    magicVerifyRef.current = true;

    const magicToken = scuteClient.getMagicLinkToken();
    if (!magicToken) { setView("login"); return; }

    // Read the "skip the passkey offer" signals before scrubbing: sct_sk=true
    // on the link, or an OAuth/SAML landing (sct_oauth). Same rule as the
    // core's shouldSkipDeviceRegister, which can't see them once scrubbed.
    const landing = typeof window !== "undefined" ? new URL(window.location.href).searchParams : null;
    const skipPasskeyOffer = !!landing && (landing.get("sct_sk") === "true" || !!landing.get("sct_oauth"));

    // Scrub the login token from the URL synchronously on detection, before
    // any await, so it cannot linger in history if verification fails
    // (SEC-36). getMagicLinkToken() reads either sct_magic or sct_oauth, and
    // SAML SSO and social OAuth both land with sct_oauth, so scrub both.
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", scrubAuthTokensFromUrl(window.location.href));
    }

    (async () => {
      let verifyResult;
      try {
        verifyResult = await scuteClient.verifyMagicLinkToken(magicToken);
      } catch (err: any) {
        setError(err?.message || "Invalid or expired link");
        setView("error");
        return;
      }
      const { data, error: verifyError } = verifyResult;

      if (verifyError) {
        setError(verifyError.message || "Invalid or expired link");
        setView("error");
        return;
      }

      // MFA required after magic link verification
      if (data && "mfaRequired" in data && data.mfaRequired) {
        handleMfaResponse(data);
        // View change handled by event listener
        return;
      }

      // Offer passkey registration after magic link verify, only when the app
      // says passkeys are on. Missing field or app data fails closed (SEC-40).
      const appData = (await scuteClient.getAppData())?.data;
      const passkeysEnabled = appData?.passkeys_enabled === true;
      if (!skipPasskeyOffer && passkeysEnabled && data?.authPayload) {
        await offerPasskey(data.authPayload);
      } else if (data?.authPayload) {
        await scuteClient.signInWithTokenPayload(data.authPayload);
      }
    })();
  }, [view, scuteClient, offerPasskey]);

  // ── 4. Poll magic link status ──
  // One request at a time: the next poll is scheduled only after the previous
  // one settles, and a response that lands after the view changed is ignored.
  useEffect(() => {
    if (view !== "magic_pending" || !magicLinkId) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const deadline = Date.now() + MAGIC_LINK_POLL_TIMEOUT_MS;

    const poll = async () => {
      if (stopped) return;
      if (Date.now() >= deadline) {
        stopped = true;
        setError(MAGIC_LINK_TIMEOUT_MESSAGE);
        setView("error");
        return;
      }
      let result;
      try {
        result = await scuteClient.getMagicLinkStatus(magicLinkId);
      } catch {
        result = null;
      }
      if (stopped) return;
      if (result && !result.error && result.data) {
        stopped = true;
        await scuteClient.signInWithTokenPayload(result.data);
        return;
      }
      timer = setTimeout(poll, MAGIC_LINK_POLL_INTERVAL_MS);
    };

    timer = setTimeout(poll, MAGIC_LINK_POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [view, magicLinkId, scuteClient]);

  // ── 5. Track authenticated state ──
  useEffect(() => {
    if (isAuthenticated && view !== "webauthn_register" && view !== "webauthn_register_success" && view !== "magic_verifying") {
      setView("authenticated");
    }
  }, [isAuthenticated]);

  // ── 6. Leave "authenticated" once the session is gone ──
  useEffect(() => {
    if (view === "authenticated" && !isAuthenticated && !isLoading) {
      resetAfterSignOut();
    }
  }, [view, isAuthenticated, isLoading, resetAfterSignOut]);

  // ── Actions ──

  const submitIdentifier = useCallback(async (id?: string) => {
    const email = id || identifier;
    if (!email || submittingRef.current) return;
    submittingRef.current = true;
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
      } else if ("mfaRequired" in data && data.mfaRequired) {
        handleMfaResponse(data);
        // View change handled by event listener (MFA_REQUIRED or MFA_ENROLLMENT_REQUIRED)
      } else if ("magic_link" in data) {
        setMagicLinkId(String(data.magic_link.id));
      }
    } catch (err: any) {
      setError(err?.message || "Failed to sign in");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [identifier, scuteClient]);

  const submitOtp = useCallback(async (code: string) => {
    setError(null);
    try {
      const result = await scuteClient.verifyOtp(code, identifier);
      if (result?.error) { setError(result.error.message); return; }
      if (result?.data && "mfaRequired" in result.data && result.data.mfaRequired) {
        setMfaChallenge(result.data.mfaChallenge);
        setMfaAvailableMethods(result.data.availableMethods || []);
        // View change handled by event listener
        return;
      }
      if (result?.data?.authPayload) {
        const appData = (await scuteClient.getAppData())?.data;
        // Fail closed (SEC-40): offer a passkey only when the app says they are on.
        if (appData?.passkeys_enabled === true) {
          await offerPasskey(result.data.authPayload);
        } else {
          await scuteClient.signInWithTokenPayload(result.data.authPayload);
        }
      }
    } catch (err: any) {
      setError(err?.message || "Invalid code");
    }
  }, [identifier, scuteClient]);

  // Only the optional suggestion can be skipped, not required enrollment.
  const skipMfaEnrollment = useCallback(() => {
    if (view !== "mfa_enroll_suggest") return;
    setView("authenticated");
  }, [view]);

  const submitMfaCode = useCallback(async (code: string) => {
    if (!mfaChallenge) return;
    setError(null);
    try {
      // verifyMfaChallenge signs in on success; SIGNED_IN moves the flow on.
      const { error: mfaError } = await scuteClient.verifyMfaChallenge(mfaChallenge.token, code);
      if (mfaError) { setError(mfaError.message); return; }
    } catch (err: any) {
      setError(err?.message || "MFA verification failed");
    }
  }, [mfaChallenge, scuteClient]);

  const registerPasskey = useCallback(async () => {
    setError(null);
    try {
      if (authPayload && exchangedPayloadRef.current !== authPayload) {
        const { error: signInError } = await scuteClient.signInWithTokenPayload(authPayload);
        if (signInError) { setError(signInError.message); return; }
        exchangedPayloadRef.current = authPayload;
      }
      const { error: addError } = await scuteClient.addDevice();
      // The user is signed in by now: show the error; skipPasskey still continues.
      if (addError) { setError(addError.message); return; }
      setView("webauthn_register_success");
      const suggestion = scuteClient.pendingMfaEnrollmentSuggestion;
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        successTimerRef.current = null;
        if (suggestion) {
          setMfaAvailableMethods(suggestion.available_methods || []);
          setMfaGracePeriod(true);
          setMfaGraceDaysRemaining(suggestion.mfa_grace_days_remaining);
          setView("mfa_enroll_suggest");
        } else {
          setView("authenticated");
        }
      }, 800);
    } catch (err: any) {
      setError(err?.message || "Failed to register passkey");
    }
  }, [authPayload, scuteClient]);

  const skipPasskey = useCallback(async () => {
    setError(null);
    if (!authPayload) {
      // Nothing to exchange: continue only on a live session.
      setView(isAuthenticated ? "authenticated" : "login");
      return;
    }
    if (exchangedPayloadRef.current !== authPayload) {
      try {
        const result = await scuteClient.signInWithTokenPayload(authPayload);
        if (result?.error) {
          setError(result.error.message || "Failed to sign in");
          return;
        }
      } catch (err: any) {
        setError(err?.message || "Failed to sign in");
        return;
      }
      exchangedPayloadRef.current = authPayload;
    }
    // The register view ignores SIGNED_IN, so move on here.
    setView("authenticated");
  }, [authPayload, isAuthenticated, scuteClient]);

  const retry = useCallback(() => {
    setError(null);
    setIdentifier("");
    setMagicLinkId(null);
    setView("login");
  }, []);

  return {
    // State
    view,
    identifier,
    error,
    submitting,
    // Follows the real session (useAuth), not the view.
    isAuthenticated,
    isLoading,
    user,

    // MFA state
    mfaChallenge,
    mfaAvailableMethods,
    mfaGracePeriod,
    mfaGraceDaysRemaining,

    // Actions
    setIdentifier,
    submitIdentifier,
    submitOtp,
    submitMfaCode,
    skipMfaEnrollment,
    registerPasskey,
    skipPasskey,
    retry,
    signOut,
  };
}
