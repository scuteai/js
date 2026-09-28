import ScuteClient, { createClient } from "./ScuteClient";
import ScuteAdminApi from "./ScuteAdminApi";
export type { AgentConversation, AgentMonitorItem, AgentReport, DecisionLogCheck, ScutePreviousAccount } from "./ScuteAdminApi";
import ScuteVerifyApi from "./ScuteVerifyApi";
import ScuteAuthzApi from "./ScuteAuthzApi";
import ScuteElementsApi from "./ScuteElementsApi";
import ScuteLocalAuthz from "./ScuteLocalAuthz";
import ScuteBrowserCookieStorage from "./lib/ScuteBrowserCookieStorage";
import { ScuteCookieStorage } from "./lib/ScuteStorage";

export * from "./lib/errors";

export {
  ScuteAdminApi,
  ScuteVerifyApi,
  ScuteAuthzApi,
  ScuteElementsApi,
  ScuteLocalAuthz,
  ScuteClient,
  createClient,
  ScuteCookieStorage,
  ScuteBrowserCookieStorage,
};

export type {
  ElementUser,
  ElementRole,
  ElementDecision,
  ScuteElementsApiConfig,
} from "./ScuteElementsApi";
export type {
  AuthzAccessRequest,
  AuthzAccessRequestInput,
  AuthzDecision,
  AuthzCheck,
  AuthzPermissions,
  AuthzResource,
} from "./ScuteAuthzApi";
export { decideLocally, verifySnapshotToken, decodeSnapshotToken } from "./lib/localAuthz";
export type { AuthzPolicy, LocalCheck, LocalDecision, SnapshotClaims } from "./lib/localAuthz";
export type { ScuteLocalAuthzOptions } from "./ScuteLocalAuthz";
export {
  evaluateCondition,
  matchesFilter,
  toPrismaWhere,
  toSqlWhere,
} from "./lib/authzFilter";
export type {
  AuthzCondition,
  AuthzFilter,
  PrismaWhereOptions,
  SqlWhereOptions,
} from "./lib/authzFilter";

export type {
  Verification,
  VerificationStatus,
  VerificationMethod,
  VerificationListParams,
  VerificationRisk,
  VerificationResult,
} from "./ScuteVerifyApi";

export {
  ScuteSession,
  sessionUnAuthenticatedState,
  sessionLoadingState,
} from "./lib/ScuteSession";
export type { Session } from "./lib/types/session";

export {
  isBrowser,
  accessTokenHeader,
  refreshTokenHeaders,
  decodeMagicLinkToken,
  decodeImpersonation,
  impersonationContext,
  needsReverification,
  scrubAuthTokensFromUrl,
} from "./lib/helpers";
export type { CookieAttributes, UniqueIdentifier } from "./lib/types/general";
export * from "./lib/types/scute";
export * from "./lib/types/session";
export * from "./lib/types/config";
export {
  AUTH_CHANGE_EVENTS,
  SCUTE_MAGIC_PARAM,
  SCUTE_SKIP_PARAM,
  SCUTE_ID_VERIFICATION_PARAM,
  SCUTE_OAUTH_PKCE_PARAM,
  SCUTE_ACCESS_STORAGE_KEY,
  SCUTE_REFRESH_STORAGE_KEY,
  SCUTE_REMEMBER_STORAGE_KEY,
} from "./lib/constants";
