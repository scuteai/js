// Headless hooks — bring your own UI

// Auth flow (login / signup / passkey / MFA)
export { useScuteAuthFlow, RESEND_COOLDOWN_SECONDS } from "./useScuteAuthFlow";
export type { AuthFlowView, SignInRefusalCode } from "./useScuteAuthFlow";

// Profile / account management
export { useUserProfile } from "./useUserProfile";
export type { UseUserProfileResult, UpdateMetaResult } from "./useUserProfile";

// Active sessions (list / revoke / current-device detection)
export { useSessions } from "./useSessions";
export type {
  UseSessionsResult,
  SessionsResult,
  SessionsErrorCode,
  RevokeResult as RevokeSessionResult,
} from "./useSessions";

// Alternate phone numbers (verified destinations for SMS)
export { useAlternatePhones } from "./useAlternatePhones";
export type {
  AlternatePhone,
  AlternatePhoneErrorCode,
  AlternatePhonesResult,
  AddResult,
  VerifyResult,
  RemoveResult,
  UseAlternatePhonesResult,
} from "./useAlternatePhones";

// Secure-your-account headless screen — list MFA methods + drive enrollment
export { useSecureAccount } from "./useSecureAccount";
export type {
  SecureMethodKey,
  SecureMethod,
  EnrollPhase,
  SecureAccountError,
  UseSecureAccountResult,
} from "./useSecureAccount";

// Embeddable admin screens (element token): user roles, access requests, decision log
export { useElementUserRoles, useElementAccessRequests, useElementDecisionLog } from "./useAuthzElements";
export type {
  ElementsSource,
  ElementActionResult,
  UseElementUserRolesResult,
  UseElementAccessRequestsResult,
  UseElementDecisionLogResult,
} from "./useAuthzElements";

// The sign-in, ready to drop in and themeable
export { ScuteSignIn } from "./signin/ScuteSignIn";
export type { ScuteAuthFlow } from "./signin/ScuteSignIn";
export { useScuteSignInStep } from "./signin/parts";
export type { StepInfo as ScuteSignInStep } from "./signin/parts";
export type {
  ScuteSignInProps,
  ScuteSignInAppearance,
  ScuteSignInCopy,
  ScuteSignInLegal,
  ScuteSignInMethods,
  ScuteSignInMood,
} from "./signin/types";

// Pre-built gate component — drop-in auth
export { ScuteAuthGate } from "./ScuteAuthGate";
export type { ScuteAuthGateProps } from "./ScuteAuthGate";
