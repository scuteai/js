"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AUTH_CHANGE_EVENTS, useScuteClient, useAuth } from "@scute/react-hooks";
import { scrubAuthTokensFromUrl } from "@scute/js-core";
import type { ScuteChallengeResponse, ScuteSignInVerification } from "@scute/js-core";
import type { ScuteMfaSetupMethod } from "@scute/js-core";

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

/**
 * `errorCode` when the app's sign-in settings didn't load (a wrong app ID,
 * no connection): the flow shows "error", and `retry` loads them again.
 */
export const APP_SETTINGS_UNAVAILABLE = "app_settings_unavailable";
const APP_SETTINGS_MESSAGE = "We couldn't load this app's sign-in settings";

/** Sign-in refusals the API names with an error code (403). */
export type SignInRefusalCode = "user_banned" | "user_suspended" | "ip_blocked" | "country_blocked";
const REFUSAL_CODES: readonly string[] = ["user_banned", "user_suspended", "ip_blocked", "country_blocked"];

/**
 * A second factor being set up while signing in (view "mfa_enroll", D18):
 * the sign-in's setup pass, what it may set up, and the factor started.
 */
export type MfaSetupState = {
  /** The sign-in's setup-only pass. */
  setupToken: string;
  /** What may be set up: "totp", "sms" or "email". */
  methods: ScuteMfaSetupMethod[];
  /** The factor started (startMfaSetup), else null. */
  method: ScuteMfaSetupMethod | null;
  enrollmentId: string | null;
  /** TOTP: the otpauth:// link for an authenticator app, and its key. */
  provisioningUri: string | null;
  secret: string | null;
  /** sms or email: where the code went. */
  sentTo: string | null;
};

/**
 * The email or phone a sign-in has to confirm first (view
 * "contact_verify", D15). Without `challenge`, ask for it
 * (submitContact); with one, a code went out (submitContactCode).
 */
export type ContactVerificationState = {
  field: "email" | "phone";
  challenge: ScuteChallengeResponse | null;
  /** Set when the person had none: they name it, and may change it. */
  setupToken: string | null;
  /** The address the person typed, when they did. */
  sentTo: string | null;
};

/** A challenge link opened here that signs nobody in (view "challenge_completed", D16). */
export type CompletedChallenge = {
  intent: string | null;
  intentFields: Record<string, unknown> | null;
};

const SETUP_METHODS: readonly string[] = ["totp", "sms", "email"];
const IDLE_MESSAGE = "You were signed out after being inactive. Sign in again.";

// What a 403 sign_in_method_disabled turned off (D13, D20), in words.
const METHOD_DISABLED: Record<string, string> = {
  email_link: "Sign-in links are turned off for this app. Start again to sign in another way.",
  email_code: "Sign-in codes by email are turned off for this app. Start again to sign in another way.",
  phone: "Signing in with a phone number is turned off for this app. Use your email instead.",
};

// The app's email method (email_auth_type): a sign-in link or a code.
const emailSignInOf = (appData: any): "link" | "code" | null =>
  appData?.email_auth_type === "otp" ? "code" : appData?.email_auth_type === "magic" ? "link" : null;

// The API's error code on a failed request (`error_code` in its JSON body),
// or the error's own string code (a WebAuthn error, for one).
function errorCodeOf(err: any): string | null {
  const fromJson = err?.json?.error_code;
  if (typeof fromJson === "string") return fromJson;
  return typeof err?.code === "string" ? err.code : null;
}

// What went wrong in the API's own words (the `error` of its JSON body),
// else the error's message. An HTTP error's message is the status text,
// which says little and is empty over HTTP/2.
function messageOf(err: any): string {
  const body = err?.json;
  if (body?.error_code === "sign_in_method_disabled" && METHOD_DISABLED[body?.details?.method]) {
    return METHOD_DISABLED[body.details.method];
  }
  for (const m of [body?.error, body?.error?.message, body?.message]) {
    if (typeof m === "string" && m.trim()) return m;
  }
  return typeof err?.message === "string" ? err.message : "";
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

// Steps shown to someone already signed in, which a sign-in event must not skip.
const KEEP_WHEN_SIGNED_IN: readonly string[] = ["webauthn_register", "webauthn_register_success", "mfa_enroll_suggest"];

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
  | "contact_verify"
  | "challenge_completed"
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
 * - The app's settings not loading: view "error" with `errorCode`
 *   "app_settings_unavailable" (`retry` loads them again)
 * - Setting up a second factor when the sign-in needs one first (view
 *   "mfa_enroll" with `mfaSetup`: `startMfaSetup`, `submitMfaSetupCode`)
 * - Confirming an email or phone first (view "contact_verify":
 *   `submitContact`, `submitContactCode`, `resendContactCode`)
 * - A step-up or custom challenge link that signs nobody in (view
 *   "challenge_completed")
 * - A magic link opened on another device that is still finishing its own
 *   steps (`finishingOnOtherDevice`)
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
  const [mfaSetup, setMfaSetup] = useState<MfaSetupState | null>(null);
  const [contactVerification, setContactVerification] = useState<ContactVerificationState | null>(null);
  const [completedChallenge, setCompletedChallenge] = useState<CompletedChallenge | null>(null);
  const [finishingOnOtherDevice, setFinishingOnOtherDevice] = useState(false);
  // The app's email method (email_auth_type), once known: a link or a code.
  const [emailSignIn, setEmailSignIn] = useState<"link" | "code" | null>(null);
  const setupBusyRef = useRef(false);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [mfaResent, setMfaResent] = useState(false);
  const [mfaSwitching, setMfaSwitching] = useState(false);
  // What people sign in with on this app (allowed_identifiers): email, phone or both.
  const [identifierTypes, setIdentifierTypes] = useState<Array<"email" | "phone">>(["email"]);

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
    setError(messageOf(err) || fallback);
    setErrorCode(errorCodeOf(err));
  }, []);
  const clearError = useCallback(() => {
    setError(null);
    setErrorCode(null);
  }, []);

  // A factor to set up first (D18): the sign-in's setup pass and what it may set up.
  const startSetupFrom = useCallback((setupToken: unknown, methods: unknown) => {
    if (typeof setupToken !== "string" || !setupToken) return;
    const allowed = (Array.isArray(methods) ? methods : []).filter((m): m is ScuteMfaSetupMethod => SETUP_METHODS.includes(m));
    setMfaSetup((current) => current?.setupToken === setupToken ? current : {
      setupToken,
      methods: allowed,
      method: null,
      enrollmentId: null,
      provisioningUri: null,
      secret: null,
      sentTo: null,
    });
  }, []);

  // Helper to set all MFA state from a response
  const handleMfaResponse = useCallback((data: any) => {
    setMfaChallenge(data.mfaChallenge);
    setMfaAvailableMethods(data.availableMethods || []);
    setMfaGracePeriod(!!data.mfaGracePeriod);
    setMfaGraceDaysRemaining(data.mfaGraceDaysRemaining);
    if (data.mfaEnrollmentRequired) startSetupFrom(data.setupToken, data.availableMethods);
  }, [startSetupFrom]);

  // An email or phone to confirm first (D15).
  const handleContactStep = useCallback((data: any) => {
    setContactVerification({
      field: data.field === "phone" ? "phone" : "email",
      challenge: data.challenge ?? null,
      setupToken: data.setupToken ?? data.setup_token ?? null,
      sentTo: null,
    });
    setView("contact_verify");
  }, []);

  // Any step a sign-in answer asks for: MFA (or a factor to set up), or a
  // contact to confirm. True when it was one.
  const handleStep = useCallback((data: any): boolean => {
    if (data && data.contactVerificationRequired) {
      handleContactStep(data);
      return true;
    }
    if (data && data.mfaRequired) {
      handleMfaResponse(data);
      // View change handled by event listener
      return true;
    }
    return false;
  }, [handleContactStep, handleMfaResponse]);

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
        setError(messageOf(result.error) || "Sign-in failed");
      } else {
        exchangedPayloadRef.current = payload;
      }
    } catch (err: any) {
      setError(messageOf(err) || "Sign-in failed");
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
    setMfaSetup(null);
    setContactVerification(null);
    setCompletedChallenge(null);
    setFinishingOnOtherDevice(false);
    magicTokenRef.current = null;
    // Signed out by the app's idle timeout (D14): say so on the email step.
    const idle = scuteClient.sessionEndReason === "session_idle";
    setError(idle ? IDLE_MESSAGE : null);
    setErrorCode(idle ? "session_idle" : null);
    setIdentifier("");
    setView("login");
  }, [scuteClient]);

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
    if (handleStep(data)) return;
    // A step-up or custom challenge's link: passed, nobody signed in (D16).
    if (data && data.challengeCompleted) {
      setCompletedChallenge({ intent: data.intent ?? null, intentFields: data.intentFields ?? null });
      setView("challenge_completed");
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
  }, [scuteClient, offerPasskey, handleStep]);

  // ── 1. Initialize SDK + detect magic link in URL ──
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      let settingsError: any = null;
      try {
        settingsError = (await scuteClient["_initialize"]())?.error ?? null;
      } catch {}
      setEmailSignIn(emailSignInOf((scuteClient as any).appData));

      try {
        const allowed = (await scuteClient.getAppData())?.data?.allowed_identifiers;
        const types = Array.isArray(allowed) ? allowed.filter((t): t is "email" | "phone" => t === "email" || t === "phone") : [];
        if (types.length) setIdentifierTypes(types);
      } catch {}

      const magicToken = scuteClient.getMagicLinkToken();
      if (magicToken) {
        setView("magic_verifying");
      } else if (!isAuthenticated && settingsError) {
        // Every sign-in needs them: say so now, not after the email.
        setError(settingsError.message || APP_SETTINGS_MESSAGE);
        setErrorCode(APP_SETTINGS_UNAVAILABLE);
        setView("error");
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
      // The passkey offer and the MFA nudge come with a session already: the
      // person moves on from them.
      if (event === AUTH_CHANGE_EVENTS.SIGNED_IN && !KEEP_WHEN_SIGNED_IN.includes(view)) {
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
        // A setup pass lets the person set a factor up here (D18).
        const pending = scuteClient.pendingMfaChallenge as any;
        if (pending?.setup_token) startSetupFrom(pending.setup_token, pending.available_methods);
        setView("mfa_enroll");
      }
      if (event === AUTH_CHANGE_EVENTS.CONTACT_VERIFICATION_REQUIRED) {
        const pending = scuteClient.pendingContactVerification;
        if (pending) {
          handleContactStep({ field: pending.field, challenge: pending.challenge, setupToken: pending.setup_token });
        } else {
          setView("contact_verify");
        }
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
  }, [scuteClient, view, resetAfterSignOut, startSetupFrom, handleContactStep]);

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
    setFinishingOnOtherDevice(false);

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
        // Signed in (SIGNED_IN moves the flow on), a step needed here too
        // (MFA, a factor to set up, a contact to confirm), or opened too
        // long ago.
        const finished = await scuteClient.signInWithMagicLinkStatus(result.data);
        if (handleStep(finished.data)) {
          // The step's view is showing.
        } else if ((finished.error as any)?.code === "magic-link-window-closed") {
          setError(MAGIC_LINK_TIMEOUT_MESSAGE);
          setErrorCode(null);
          setView("error");
        }
        return;
      }
      // The account needs MFA and the API wants it finished on the device
      // that opened the link: say so, and stop waiting.
      if (result?.error && errorCodeOf(result.error) === "mfa_required") {
        stopped = true;
        setError(messageOf(result.error) || "Finish signing in on the device where you opened the link.");
        setErrorCode("mfa_required");
        setView("error");
        return;
      }
      // The link was opened and that device is finishing its own steps (D2):
      // say so, and keep waiting.
      if (result?.error && errorCodeOf(result.error) === "sign_in_pending") {
        setFinishingOnOtherDevice(true);
      }
      // Not opened yet (or no answer): ask again.
      timer = setTimeout(poll, MAGIC_LINK_POLL_INTERVAL_MS);
    };

    timer = setTimeout(poll, MAGIC_LINK_POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [view, magicLinkId, scuteClient, handleStep]);

  // ── 5. Track authenticated state ──
  useEffect(() => {
    if (isAuthenticated && !KEEP_WHEN_SIGNED_IN.includes(view) && view !== "magic_verifying") {
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
        setError(messageOf(signError));
        setErrorCode(errorCodeOf(signError));
        if (errorCodeOf(signError) === "sign_in_method_disabled") {
          // The app changed how people sign in (D13, D20): the next try
          // follows its current settings.
          try {
            const fresh = (await scuteClient.getAppData(true))?.data;
            setEmailSignIn(emailSignInOf(fresh));
            const allowed = fresh?.allowed_identifiers;
            const types = Array.isArray(allowed) ? allowed.filter((t): t is "email" | "phone" => t === "email" || t === "phone") : [];
            if (types.length) setIdentifierTypes(types);
          } catch {}
        }
        return;
      }
      if (!data) {
        // WebAuthn succeeded — SIGNED_IN event will fire
      } else if (handleStep(data)) {
        // View change handled by event listener (MFA_REQUIRED,
        // MFA_ENROLLMENT_REQUIRED or CONTACT_VERIFICATION_REQUIRED)
      } else if ("magic_link" in data) {
        setMagicLinkId(String(data.magic_link.id));
      }
    } catch (err: any) {
      fail(err, "Failed to sign in");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [identifier, scuteClient, fail, clearError, handleStep]);

  // Resolves to true when the code was accepted, false when it wasn't.
  const submitOtp = useCallback(async (code: string): Promise<boolean> => {
    clearError();
    try {
      const result = await scuteClient.verifyOtp(code, identifier);
      if (result?.error) { setError(messageOf(result.error)); setErrorCode(errorCodeOf(result.error)); return false; }
      if (result?.data && "mfaRequired" in result.data && result.data.mfaRequired) {
        setMfaChallenge(result.data.mfaChallenge);
        setMfaAvailableMethods(result.data.availableMethods || []);
        if ((result.data as any).mfaEnrollmentRequired) startSetupFrom((result.data as any).setupToken, result.data.availableMethods);
        // View change handled by event listener
        return true;
      }
      if (handleStep(result?.data)) return true;
      if (result?.data && "authPayload" in result.data && result.data.authPayload) {
        // Fail closed (SEC-40): offer a passkey only when the app says they
        // are on, and only where this browser can make one.
        await afterFirstFactor(result.data);
      }
      return true;
    } catch (err: any) {
      fail(err, "Invalid code");
      return false;
    }
  }, [identifier, scuteClient, afterFirstFactor, fail, clearError, handleStep, startSetupFrom]);

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
        if (sendError) failure = messageOf(sendError) || "We couldn't send a new link";
        else if (data?.magic_link) setMagicLinkId(String(data.magic_link.id));
      } else {
        const { error: sendError } = await scuteClient.sendLoginOtp(identifier, undefined, false);
        if (sendError) failure = messageOf(sendError) || "We couldn't send a new code";
      }
    } catch (err: any) {
      failure = messageOf(err) || "We couldn't send it again";
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
      // Backup codes are shown as XXXX-XXXX; the boxes drop the dash.
      const method = String(mfaChallenge.method ?? "");
      const sent = (method === "backup_code" || method === "backup_codes") && /^[A-Za-z0-9]{8}$/.test(code)
        ? `${code.slice(0, 4)}-${code.slice(4)}`.toUpperCase()
        : code;
      // verifyMfaChallenge signs in on success; SIGNED_IN moves the flow on.
      const { error: mfaError } = await scuteClient.verifyMfaChallenge(mfaChallenge.token, sent);
      if (mfaError) { setError(messageOf(mfaError)); setErrorCode(errorCodeOf(mfaError)); return false; }
      return true;
    } catch (err: any) {
      setError(messageOf(err) || "MFA verification failed");
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
        const message = messageOf(resendErr) || "We couldn't send a new code";
        fail(resendErr, message);
        return message;
      }
      setMfaChallenge(data.challenge);
      setMfaResent(true);
      return null;
    } catch (err: any) {
      fail(err, "We couldn't send a new code");
      return messageOf(err) || "We couldn't send a new code";
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
        const message = messageOf(switchErr) || "We couldn't switch methods";
        fail(switchErr, message);
        return message;
      }
      setMfaChallenge(data as ScuteChallengeResponse);
      return null;
    } catch (err: any) {
      fail(err, "We couldn't switch methods");
      return messageOf(err) || "We couldn't switch methods";
    } finally {
      setMfaSwitching(false);
    }
  }, [mfaChallenge, scuteClient, fail, clearError]);

  // A setup pass that expired or was used: the sign-in starts over.
  const setupExpired = useCallback((err: any) => {
    if (errorCodeOf(err) !== "setup_expired" && errorCodeOf(err) !== "setup_send_limit") return false;
    fail(err, "This sign-in timed out. Sign in again.");
    setView("error");
    return true;
  }, [fail]);

  /**
   * Set up a second factor the sign-in needs first (view "mfa_enroll" with
   * `mfaSetup`): "totp" answers a key for an authenticator app; "sms" and
   * "email" send a code to `destination`. Resolves to the error message, or
   * null when it started.
   */
  const startMfaSetup = useCallback(async (method: ScuteMfaSetupMethod, destination?: string): Promise<string | null> => {
    if (!mfaSetup || setupBusyRef.current) return null;
    setupBusyRef.current = true;
    setSubmitting(true);
    clearError();
    try {
      const { data, error: enrollError } = await scuteClient.enrollMfaWithSetupToken(
        mfaSetup.setupToken, method, destination?.trim() || undefined
      );
      if (enrollError || !data?.enrollment) {
        if (setupExpired(enrollError)) return messageOf(enrollError) || "This sign-in timed out";
        const message = messageOf(enrollError) || "We couldn't set that up";
        fail(enrollError, message);
        if (errorCodeOf(enrollError) === "mfa_method_unavailable") setView("error");
        return message;
      }
      setMfaSetup({
        ...mfaSetup,
        method,
        enrollmentId: String(data.enrollment.id),
        provisioningUri: data.provisioning_uri ?? null,
        secret: data.secret ?? null,
        sentTo: method === "totp" ? null : destination?.trim() || null,
      });
      return null;
    } catch (err: any) {
      fail(err, "We couldn't set that up");
      return messageOf(err) || "We couldn't set that up";
    } finally {
      setupBusyRef.current = false;
      setSubmitting(false);
    }
  }, [mfaSetup, scuteClient, clearError, fail, setupExpired]);

  /**
   * The code of the factor being set up: verifying it finishes the sign-in
   * (SIGNED_IN), or moves on to the next step. Resolves to true when it was
   * accepted.
   */
  const submitMfaSetupCode = useCallback(async (code: string): Promise<boolean> => {
    if (!mfaSetup?.enrollmentId || setupBusyRef.current) return false;
    setupBusyRef.current = true;
    clearError();
    try {
      const { data, error: verifyError } = await scuteClient.verifyMfaEnrollmentWithSetupToken(
        mfaSetup.setupToken, mfaSetup.enrollmentId, code
      );
      if (verifyError) {
        if (!setupExpired(verifyError)) fail(verifyError, "That code didn't work");
        return false;
      }
      handleStep(data);
      return true;
    } catch (err: any) {
      fail(err, "That code didn't work");
      return false;
    } finally {
      setupBusyRef.current = false;
    }
  }, [mfaSetup, scuteClient, clearError, fail, setupExpired, handleStep]);

  /** Back to choosing what to set up (another way). */
  const restartMfaSetup = useCallback(() => {
    clearError();
    setMfaSetup((current) => current && {
      ...current, method: null, enrollmentId: null, provisioningUri: null, secret: null, sentTo: null,
    });
  }, [clearError]);

  /**
   * Name the email or phone to confirm (view "contact_verify" without a
   * challenge): a code goes to it. Resolves to the error message, or null.
   */
  const submitContact = useCallback(async (value: string): Promise<string | null> => {
    const contact = contactVerification;
    if (!contact?.setupToken || !value.trim() || setupBusyRef.current) return null;
    setupBusyRef.current = true;
    setSubmitting(true);
    clearError();
    try {
      const { data, error: addError } = await scuteClient.addSignInContact(value.trim(), contact.setupToken);
      if (addError || !data?.challenge) {
        if (setupExpired(addError)) return messageOf(addError) || "This sign-in timed out";
        const message = messageOf(addError) || "We couldn't send a code there";
        fail(addError, message);
        return message;
      }
      setContactVerification({ ...contact, challenge: data.challenge, sentTo: value.trim() });
      return null;
    } catch (err: any) {
      fail(err, "We couldn't send a code there");
      return messageOf(err) || "We couldn't send a code there";
    } finally {
      setupBusyRef.current = false;
      setSubmitting(false);
    }
  }, [contactVerification, scuteClient, clearError, fail, setupExpired]);

  /**
   * The code sent to the email or phone to confirm: signs in (SIGNED_IN),
   * or moves on to the next step (MFA, a factor to set up). Resolves to
   * true when it was accepted.
   */
  const submitContactCode = useCallback(async (code: string): Promise<boolean> => {
    const token = contactVerification?.challenge?.token;
    if (!token || setupBusyRef.current) return false;
    setupBusyRef.current = true;
    clearError();
    try {
      const { data, error: verifyError } = await scuteClient.verifyContactVerification(code, token);
      if (verifyError) {
        fail(verifyError, "That code didn't work");
        return false;
      }
      handleStep(data);
      return true;
    } catch (err: any) {
      fail(err, "That code didn't work");
      return false;
    } finally {
      setupBusyRef.current = false;
    }
  }, [contactVerification, scuteClient, clearError, fail, handleStep]);

  /** Send the confirmation code again. Resolves to the error message, or null. */
  const resendContactCode = useCallback(async (): Promise<string | null> => {
    const contact = contactVerification;
    if (!contact?.challenge?.token) return null;
    clearError();
    try {
      const { data, error: resendErr } = await scuteClient.resendContactVerification(contact.challenge.token);
      if (resendErr || !data?.challenge) {
        const message = messageOf(resendErr) || "We couldn't send a new code";
        fail(resendErr, message);
        return message;
      }
      setContactVerification({ ...contact, challenge: data.challenge });
      return null;
    } catch (err: any) {
      fail(err, "We couldn't send a new code");
      return messageOf(err) || "We couldn't send a new code";
    }
  }, [contactVerification, scuteClient, clearError, fail]);

  /** Name another email or phone (only when the person typed it in). */
  const changeContact = useCallback(() => {
    clearError();
    setContactVerification((current) => current?.setupToken ? { ...current, challenge: null, sentTo: null } : current);
  }, [clearError]);

  /** Sign in with an OAuth provider the app has set up, like "google". Leaves the page. */
  const signInWithOAuth = useCallback((provider: string) => {
    scuteClient.signInWithOAuthProvider(provider);
  }, [scuteClient]);

  const registerPasskey = useCallback(async () => {
    setError(null);
    try {
      if (authPayload && exchangedPayloadRef.current !== authPayload) {
        const { error: signInError } = await scuteClient.signInWithTokenPayload(authPayload);
        if (signInError) { setError(messageOf(signInError)); return; }
        exchangedPayloadRef.current = authPayload;
      }
      const { error: addError } = await scuteClient.addDevice();
      // The user is signed in by now: show the error; skipPasskey still continues.
      if (addError) { setError(messageOf(addError)); setErrorCode(errorCodeOf(addError)); return; }
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
      setError(messageOf(err) || "Failed to register passkey");
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
          setError(messageOf(result.error) || "Failed to sign in");
          return;
        }
      } catch (err: any) {
        setError(messageOf(err) || "Failed to sign in");
        return;
      }
      exchangedPayloadRef.current = authPayload;
    }
    // The register view ignores SIGNED_IN, so move on here: to the MFA nudge
    // when this sign-in brought one, as after adding a passkey.
    const suggestion = scuteClient.pendingMfaEnrollmentSuggestion;
    if (suggestion) {
      setMfaAvailableMethods(suggestion.available_methods || []);
      setMfaGracePeriod(true);
      setMfaGraceDaysRemaining(suggestion.mfa_grace_days_remaining);
      setView("mfa_enroll_suggest");
    } else {
      setView("authenticated");
    }
  }, [authPayload, isAuthenticated, scuteClient]);

  const retry = useCallback(() => {
    const settingsFailed = errorCode === APP_SETTINGS_UNAVAILABLE;
    setError(null);
    setErrorCode(null);
    setIdentifier("");
    setMagicLinkId(null);
    setVerification(null);
    setMfaSetup(null);
    setContactVerification(null);
    setCompletedChallenge(null);
    setFinishingOnOtherDevice(false);
    magicTokenRef.current = null;
    setMfaResent(false);
    if (!settingsFailed) {
      setView("login");
      return;
    }
    // The app's settings didn't load: fetch them again before the email.
    setView("loading");
    (async () => {
      let settingsError: any;
      try {
        settingsError = (await scuteClient.getAppData(true))?.error ?? null;
      } catch (err) {
        settingsError = err ?? {};
      }
      if (settingsError) {
        setError(settingsError.message || APP_SETTINGS_MESSAGE);
        setErrorCode(APP_SETTINGS_UNAVAILABLE);
        setView("error");
      } else {
        setView("login");
      }
    })();
  }, [errorCode, scuteClient]);

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
    /** What the app takes to sign in (its allowed_identifiers): "email", "phone" or both. */
    identifierTypes,
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

    /** A second factor to set up first (view "mfa_enroll"), when the sign-in gave a setup pass. */
    mfaSetup,
    /** The email or phone to confirm first (view "contact_verify"). */
    contactVerification,
    /** The challenge link that was passed (view "challenge_completed"). */
    completedChallenge,
    /** The magic link was opened on another device that is finishing its own steps; still waiting. */
    finishingOnOtherDevice,
    /** How the app signs in by email (its email_auth_type): "link", "code", or null until known. */
    emailSignIn,

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
    startMfaSetup,
    submitMfaSetupCode,
    restartMfaSetup,
    submitContact,
    submitContactCode,
    resendContactCode,
    changeContact,
    resend,
    signInWithOAuth,
    skipMfaEnrollment,
    registerPasskey,
    skipPasskey,
    retry,
    signOut,
  };
}
