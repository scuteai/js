"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AUTH_CHANGE_EVENTS, useScuteClient, useAuth } from "@scute/react-hooks";
import { scrubAuthTokensFromUrl } from "@scute/js-core";
import type { ScuteChallengeResponse, ScuteSignInVerification } from "@scute/js-core";

// Magic link status polling: one request at a time, every 2s, for at most 10
// minutes. The API does not return the link's expiry, so this is a fixed cap.
const MAGIC_LINK_POLL_INTERVAL_MS = 2000;
const MAGIC_LINK_POLL_TIMEOUT_MS = 10 * 60 * 1000;
const MAGIC_LINK_TIMEOUT_MESSAGE = "The sign-in link timed out. Please try again.";

/**
 * Seconds between sends of a sign-in link or code. The API allows 5 sends a
 * minute per address (refused ones count too), so one every 30s never
 * reaches it.
 */
export const RESEND_COOLDOWN_SECONDS = 30;

/** Sign-in refusals the API names with an error code (403). */
export type SignInRefusalCode = "user_banned" | "user_suspended" | "ip_blocked" | "country_blocked";
const REFUSAL_CODES: readonly string[] = ["user_banned", "user_suspended", "ip_blocked", "country_blocked"];

// The API's error code on a failed request (`error_code` in its JSON body),
// or the error's own string code (a WebAuthn error, for one).
function errorCodeOf(err: any): string | null {
  const fromJson = err?.json?.error_code;
  if (typeof fromJson === "string") return fromJson;
  return typeof err?.code === "string" ? err.code : null;
}

// A passkey prompt that was cancelled, timed out or failed: not fatal, the
// sign-in falls back to a link or a code.
function isPasskeyPromptError(err: any): boolean {
  if (!err) return false;
  const name = String(err.name ?? "");
  const code = String(err.code ?? "");
  return name === "NotAllowedError" || name === "AbortError" || name === "TechnicalError" ||
    code === "ERROR_CEREMONY_ABORTED" || code === "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY" ||
    String(err.message ?? "").includes("Technical Error");
}

/**
 * Auth flow views — represents the current step in the auth lifecycle.
 */
export type AuthFlowView =
  | "loading"
  | "login"
  | "magic_pending"
  | "magic_verifying"
  | "verification_required"
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
 * - Resend of the link or the code, with a cooldown (`resend`, `resendIn`)
 * - Attack protection's code step on a magic link ("verification_required",
 *   `submitVerificationCode`)
 * - MFA: verify, resend, switch method (`submitMfaCode`, `resendMfaCode`,
 *   `switchMfaMethod`), enrollment required or suggested
 * - No passkey offer where the browser can't make one (`passkeysSupported`)
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
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [verification, setVerification] = useState<ScuteSignInVerification | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [mfaResent, setMfaResent] = useState(false);
  const [mfaSwitching, setMfaSwitching] = useState(false);

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
  // The magic link token, kept (the URL is scrubbed) for the code step that
  // attack protection may ask for: once verified, the same link signs in.
  const magicTokenRef = useRef<string | null>(null);
  const skipPasskeyOfferRef = useRef(false);
  const submittingCodeRef = useRef(false);
  const passkeysSupported = typeof scuteClient.isWebauthnSupported === "function"
    ? !!scuteClient.isWebauthnSupported()
    : false;

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => () => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
  }, []);

  // Every failure shown by the flow: the message, and the API's code for it.
  const fail = useCallback((err: any, fallback: string) => {
    setError(err?.message || fallback);
    setErrorCode(errorCodeOf(err));
  }, []);
  const clearError = useCallback(() => {
    setError(null);
    setErrorCode(null);
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
    setVerification(null);
    magicTokenRef.current = null;
    setError(null);
    setErrorCode(null);
    setIdentifier("");
    setView("login");
  }, []);

  // A first factor passed (a magic link, its verification code, or an email
  // code): MFA, attack protection's code step, a passkey offer or straight
  // in. A passkey is offered only when the app has them on (fail closed,
  // SEC-40) and this browser can make one.
  const afterFirstFactor = useCallback(async (data: any, opts: { skipPasskeyOffer?: boolean } = {}) => {
    if (data && "verificationRequired" in data && data.verificationRequired) {
      if (!data.verification) {
        setError("We couldn't send the verification code. Start again from your email.");
        setErrorCode("verification_unavailable");
        setView("error");
        return;
      }
      setVerification(data.verification);
      setView("verification_required");
      return;
    }
    if (data && "mfaRequired" in data && data.mfaRequired) {
      handleMfaResponse(data);
      // View change handled by event listener
      return;
    }
    if (!data?.authPayload) return;
    const appData = (await scuteClient.getAppData())?.data;
    const passkeysEnabled = appData?.passkeys_enabled === true;
    const canAddPasskey = typeof scuteClient.isWebauthnSupported === "function" && !!scuteClient.isWebauthnSupported();
    if (!opts.skipPasskeyOffer && passkeysEnabled && canAddPasskey) {
      await offerPasskey(data.authPayload);
    } else {
      await scuteClient.signInWithTokenPayload(data.authPayload);
    }
  }, [scuteClient, offerPasskey, handleMfaResponse]);

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
        const pending = scuteClient.pendingMfaChallenge;
        if (pending?.mfa_challenge) {
          setMfaChallenge((current: any) => current ?? pending.mfa_challenge);
          setMfaAvailableMethods((current) => current.length ? current : pending.available_methods || []);
        }
        setView("mfa_verify");
      }
      if (event === AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_REQUIRED) {
        setView("mfa_enroll");
      }
      if (event === AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_SUGGESTED) {
        const suggestion = scuteClient.pendingMfaEnrollmentSuggestion;
        if (suggestion) {
          setMfaAvailableMethods(suggestion.available_methods || []);
          setMfaGracePeriod(true);
          setMfaGraceDaysRemaining(suggestion.mfa_grace_days_remaining);
        }
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
    magicTokenRef.current = magicToken;
    skipPasskeyOfferRef.current = skipPasskeyOffer;

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
        fail(err, "Invalid or expired link");
        setView("error");
        return;
      }
      const { data, error: verifyError } = verifyResult;

      if (verifyError) {
        fail(verifyError, "Invalid or expired link");
        setView("error");
        return;
      }

      // MFA, attack protection's code step, the passkey offer (only when
      // the app says passkeys are on; missing field or app data fails
      // closed, SEC-40) or straight in.
      await afterFirstFactor(data, { skipPasskeyOffer });
    })();
  }, [view, scuteClient, afterFirstFactor, fail]);

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

  // ── 7. Resend cooldown ──
  // The wait starts as the first link or code goes out (the flow arrives at
  // the pending view), and again after every resend, failed ones too.
  useEffect(() => {
    if (view === "magic_pending" || view === "otp_input") {
      const at = Date.now();
      setLastSentAt(at);
      setNow(at);
      setResent(false);
      setResendError(null);
    }
  }, [view]);
  const resendIn = lastSentAt === null
    ? 0
    : Math.max(0, Math.ceil((lastSentAt + RESEND_COOLDOWN_SECONDS * 1000 - now) / 1000));
  useEffect(() => {
    if (resendIn === 0) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [resendIn]);

  // ── Actions ──

  const submitIdentifier = useCallback(async (id?: string) => {
    const email = id || identifier;
    if (!email || submittingRef.current) return;
    submittingRef.current = true;
    setIdentifier(email);
    setSubmitting(true);
    clearError();

    try {
      const { data, error: signError } = await scuteClient.signInOrUp(email);
      if (signError && isPasskeyPromptError(signError)) {
        // The passkey prompt was cancelled or failed: send a code or a link
        // instead, as the app is set up.
        const appData = (await scuteClient.getAppData())?.data;
        const byCode = appData?.email_auth_type === "otp" || !email.includes("@");
        const sent = byCode
          ? await scuteClient.sendLoginOtp(email)
          : await scuteClient.sendLoginMagicLink(email);
        if (sent?.error) {
          fail(sent.error, "Failed to sign in");
          setView("login");
        } else if (sent?.data && "magic_link" in sent.data) {
          setMagicLinkId(String((sent.data as any).magic_link.id));
        }
        return;
      }
      if (signError) {
        setError(signError.message);
        setErrorCode(errorCodeOf(signError));
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
      fail(err, "Failed to sign in");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [identifier, scuteClient, fail, clearError]);

  // Resolves to true when the code was accepted, false when it wasn't.
  const submitOtp = useCallback(async (code: string): Promise<boolean> => {
    clearError();
    try {
      const result = await scuteClient.verifyOtp(code, identifier);
      if (result?.error) { setError(result.error.message); setErrorCode(errorCodeOf(result.error)); return false; }
      if (result?.data && "mfaRequired" in result.data && result.data.mfaRequired) {
        setMfaChallenge(result.data.mfaChallenge);
        setMfaAvailableMethods(result.data.availableMethods || []);
        // View change handled by event listener
        return true;
      }
      if (result?.data?.authPayload) {
        // Fail closed (SEC-40): offer a passkey only when the app says they
        // are on, and only where this browser can make one.
        await afterFirstFactor(result.data);
      }
      return true;
    } catch (err: any) {
      fail(err, "Invalid code");
      return false;
    }
  }, [identifier, scuteClient, afterFirstFactor, fail, clearError]);

  /**
   * Attack protection's code step: verify the code it sent, then the same
   * magic link signs in (or asks for MFA, or offers a passkey).
   */
  const submitVerificationCode = useCallback(async (code: string): Promise<boolean> => {
    if (!verification || !magicTokenRef.current || submittingCodeRef.current) return false;
    submittingCodeRef.current = true;
    setSubmitting(true);
    clearError();
    try {
      const { data, error: verifyError } = await scuteClient.verifySignInVerification(code, {
        challengeToken: verification.token,
        magicToken: magicTokenRef.current,
      });
      if (verifyError) {
        fail(verifyError, "That code didn't work");
        return false;
      }
      await afterFirstFactor(data, { skipPasskeyOffer: skipPasskeyOfferRef.current });
      return true;
    } catch (err: any) {
      fail(err, "That code didn't work");
      return false;
    } finally {
      submittingCodeRef.current = false;
      setSubmitting(false);
    }
  }, [verification, scuteClient, afterFirstFactor, fail, clearError]);

  /**
   * Send the sign-in link or code again, to the same address. Allowed once
   * `resendIn` is 0; every attempt restarts the wait. Resolves to the error
   * message, or null when it went out.
   */
  const resend = useCallback(async (): Promise<string | null> => {
    if (resending || resendIn > 0 || !identifier) return null;
    if (view !== "magic_pending" && view !== "otp_input") return null;
    setResending(true);
    setResent(false);
    setResendError(null);
    let failure: string | null = null;
    try {
      // signInOrUp sent a login or a register one; the API finds or creates
      // the user either way, so the login send repeats both. No pending
      // event: the flow is already on the step.
      if (view === "magic_pending") {
        const { data, error: sendError } = await scuteClient.sendLoginMagicLink(identifier, undefined, false);
        if (sendError) failure = sendError.message || "We couldn't send a new link";
        else if (data?.magic_link) setMagicLinkId(String(data.magic_link.id));
      } else {
        const { error: sendError } = await scuteClient.sendLoginOtp(identifier, undefined, false);
        if (sendError) failure = sendError.message || "We couldn't send a new code";
      }
    } catch (err: any) {
      failure = err?.message || "We couldn't send it again";
    }
    const at = Date.now();
    setLastSentAt(at);
    setNow(at);
    setResending(false);
    if (failure) setResendError(failure);
    else setResent(true);
    return failure;
  }, [resending, resendIn, identifier, view, scuteClient]);

  // Only the optional suggestion can be skipped, not required enrollment.
  const skipMfaEnrollment = useCallback(() => {
    if (view !== "mfa_enroll_suggest") return;
    setView("authenticated");
  }, [view]);

  const submitMfaCode = useCallback(async (code: string): Promise<boolean> => {
    if (!mfaChallenge) return false;
    clearError();
    try {
      // verifyMfaChallenge signs in on success; SIGNED_IN moves the flow on.
      const { error: mfaError } = await scuteClient.verifyMfaChallenge(mfaChallenge.token, code);
      if (mfaError) { setError(mfaError.message); setErrorCode(errorCodeOf(mfaError)); return false; }
      return true;
    } catch (err: any) {
      setError(err?.message || "MFA verification failed");
      return false;
    }
  }, [mfaChallenge, scuteClient, clearError]);

  /** Send the MFA code again (methods that deliver one: email, text). */
  const resendMfaCode = useCallback(async (): Promise<string | null> => {
    if (!mfaChallenge) return null;
    setMfaResent(false);
    clearError();
    try {
      const { data, error: resendErr } = await scuteClient.resendChallenge(mfaChallenge.token);
      if (resendErr || !data?.challenge) {
        const message = resendErr?.message || "We couldn't send a new code";
        fail(resendErr, message);
        return message;
      }
      setMfaChallenge(data.challenge);
      setMfaResent(true);
      return null;
    } catch (err: any) {
      fail(err, "We couldn't send a new code");
      return err?.message || "We couldn't send a new code";
    }
  }, [mfaChallenge, scuteClient, fail, clearError]);

  /** Use another MFA method the user has set up (from `mfaAvailableMethods`). */
  const switchMfaMethod = useCallback(async (method: string): Promise<string | null> => {
    if (!mfaChallenge) return null;
    setMfaSwitching(true);
    setMfaResent(false);
    clearError();
    try {
      const { data, error: switchErr } = await scuteClient.switchMfaMethod(mfaChallenge.token, method);
      if (switchErr || !data) {
        const message = switchErr?.message || "We couldn't switch methods";
        fail(switchErr, message);
        return message;
      }
      setMfaChallenge(data as ScuteChallengeResponse);
      return null;
    } catch (err: any) {
      fail(err, "We couldn't switch methods");
      return err?.message || "We couldn't switch methods";
    } finally {
      setMfaSwitching(false);
    }
  }, [mfaChallenge, scuteClient, fail, clearError]);

  /** Sign in with an OAuth provider the app has set up, like "google". Leaves the page. */
  const signInWithOAuth = useCallback((provider: string) => {
    scuteClient.signInWithOAuthProvider(provider);
  }, [scuteClient]);

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
      if (addError) { setError(addError.message); setErrorCode(errorCodeOf(addError)); return; }
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
    setErrorCode(null);
    setIdentifier("");
    setMagicLinkId(null);
    setVerification(null);
    magicTokenRef.current = null;
    setMfaResent(false);
    setView("login");
  }, []);

  return {
    // State
    view,
    identifier,
    error,
    /** The API's code for `error` (like "user_banned" or "ip_blocked"), when it named one. */
    errorCode,
    submitting,
    /** This browser can make a passkey (a secure page with the WebAuthn API). */
    passkeysSupported,
    // Follows the real session (useAuth), not the view.
    isAuthenticated,
    isLoading,
    user,

    // MFA state
    mfaChallenge,
    mfaAvailableMethods,
    mfaGracePeriod,
    mfaGraceDaysRemaining,
    mfaResent,
    mfaSwitching,

    // Attack protection's code step (view "verification_required")
    verification,

    // Resend of the link or the code
    resendIn,
    resending,
    resent,
    resendError,

    // Actions
    setIdentifier,
    submitIdentifier,
    submitOtp,
    submitMfaCode,
    resendMfaCode,
    switchMfaMethod,
    submitVerificationCode,
    resend,
    signInWithOAuth,
    skipMfaEnrollment,
    registerPasskey,
    skipPasskey,
    retry,
    signOut,
  };
}
