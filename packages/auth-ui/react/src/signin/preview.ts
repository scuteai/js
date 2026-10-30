import type { ScuteUserData } from "@scute/js-core";
import type { ScuteAuthFlow } from "./ScuteSignIn";
import type { ScuteSignInPreview, ScuteSignInProps } from "./types";

/** The address a preview step shows when none is given. */
export const PREVIEW_EMAIL = "you@example.com";

const nothing = () => {};
const sendsNothing = async () => {};
const neverAccepted = async () => false;
const noFailure = async () => null;

/** The `preview` prop as an object. */
export function previewOf(preview: NonNullable<ScuteSignInProps["preview"]>): ScuteSignInPreview {
  return typeof preview === "string" ? { view: preview } : preview;
}

/**
 * A flow that stays on one step with sample data, for the `preview` prop:
 * no client, no requests, and its actions do nothing (a code is never
 * accepted).
 */
export function previewFlow(p: ScuteSignInPreview): ScuteAuthFlow {
  const { view } = p;
  const email = p.email ?? (view === "login" ? "" : PREVIEW_EMAIL);
  const mfaMethod = p.mfaMethod ?? "totp";
  const flow: ScuteAuthFlow = {
    view,
    identifier: email,
    error: p.error ?? null,
    errorCode: p.errorCode ?? null,
    submitting: false,
    passkeysSupported: true,
    identifierTypes: ["email"],
    isAuthenticated: false,
    isLoading: false,
    // Only the email is drawn (the "authenticated" step).
    user: view === "authenticated" ? ({ id: "preview", email: email || PREVIEW_EMAIL } as ScuteUserData) : null,

    mfaChallenge: view === "mfa_verify"
      ? { token: "preview", method: mfaMethod, delivery_required: mfaMethod === "email_otp" || mfaMethod === "sms_otp" }
      : null,
    mfaAvailableMethods: p.mfaMethods ?? [mfaMethod],
    mfaGracePeriod: view === "mfa_enroll_suggest",
    mfaGraceDaysRemaining: p.mfaGraceDaysRemaining,
    mfaResent: false,
    mfaSwitching: false,
    deviceTrustOffered: typeof p.deviceTrustDays === "number",
    deviceTrustDays: p.deviceTrustDays ?? null,
    trustDevice: false,
    setTrustDevice: nothing,

    verification: view === "verification_required"
      ? { token: "preview", method: p.verificationMethod ?? "email_otp", expires_at: "" }
      : null,

    resendIn: 0,
    resending: false,
    resent: false,
    resendError: null,

    setIdentifier: nothing,
    submitIdentifier: sendsNothing,
    submitOtp: neverAccepted,
    submitMfaCode: neverAccepted,
    resendMfaCode: noFailure,
    switchMfaMethod: noFailure,
    submitVerificationCode: neverAccepted,
    resend: noFailure,
    signInWithOAuth: nothing,
    skipMfaEnrollment: nothing,
    registerPasskey: sendsNothing,
    skipPasskey: sendsNothing,
    retry: nothing,
    signOut: async () => false,
  };
  return flow;
}
