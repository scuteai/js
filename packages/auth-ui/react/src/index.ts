// Headless hooks — bring your own UI

// Auth flow (login / signup / passkey / MFA)
export { useScuteAuthFlow } from "./useScuteAuthFlow";
export type { AuthFlowView } from "./useScuteAuthFlow";

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

// Pre-built gate component — drop-in auth
export { ScuteAuthGate } from "./ScuteAuthGate";
export type { ScuteAuthGateProps } from "./ScuteAuthGate";
