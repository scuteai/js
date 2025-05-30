import ScuteClient, { createClient } from "./ScuteClient";
import ScuteAdminApi from "./ScuteAdminApi";
import ScuteBrowserCookieStorage from "./lib/ScuteBrowserCookieStorage";
import { ScuteCookieStorage } from "./lib/ScuteStorage";

export * from "./lib/errors";

export {
  ScuteAdminApi,
  ScuteClient,
  createClient,
  ScuteCookieStorage,
  ScuteBrowserCookieStorage,
};

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
} from "./lib/helpers";
export type { CookieAttributes, UniqueIdentifier } from "./lib/types/general";
export * from "./lib/types/scute";

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
