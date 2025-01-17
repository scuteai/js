import type { ValueOf } from "type-fest";

import type { ScuteUserData } from "./types/scute";
import type { Session } from "./types/session";

export const AUTH_CHANGE_EVENTS = {
  SIGNED_IN: "signed_in",
  SIGNED_OUT: "signed_out",
  INITIAL_SESSION: "initial_session",
  SESSION_REFETCH: "session_refetch",
  SESSION_EXPIRED: "session_expired",
  TOKEN_REFRESHED: "token_refreshed",
  MAGIC_PENDING: "magic_pending",
  MAGIC_NEW_DEVICE_PENDING: "magic_new_device_pending",
  MAGIC_VERIFIED: "magic_verified",
  MAGIC_VERIFIED_OAUTH: "magic_verified_oauth",
  WEBAUTHN_REGISTER_START: "webauthn_register_start",
  WEBAUTHN_REGISTER_SUCCESS: "webauthn_register_success",
  WEBAUTHN_VERIFY_START: "webauthn_verify_start",
  WEBAUTHN_VERIFY_SUCCESS: "webauthn_verify_success",
  OTP_PENDING: "otp_pending",
} as const;

export type AuthChangeEvent = ValueOf<typeof AUTH_CHANGE_EVENTS>;

const AUTH_STATE_CHANGED = "authStateChanged";

export const INTERNAL_EVENTS = {
  AUTH_STATE_CHANGED,
} as const;

export type InternalEvent = {
  [AUTH_STATE_CHANGED]: {
    event: AuthChangeEvent;
    session?: Session | null;
    user?: ScuteUserData | null;
    _broadcasted?: boolean;
  };
};

export const SCUTE_BROADCAST_CHANNEL = "sct_broadcast";
export const SCUTE_MAGIC_PARAM = "sct_magic";
export const SCUTE_SKIP_PARAM = "sct_sk";
export const SCUTE_ID_VERIFICATION_PARAM = "sct_idv";
export const SCUTE_OAUTH_PKCE_PARAM = "sct_pkce";
export const SCUTE_CRED_STORAGE_KEY = "sct_cred_data";
export const SCUTE_LAST_LOGIN_STORAGE_KEY = "sct_last_login";

export const SCUTE_ACCESS_STORAGE_KEY = "sc-access-token";
export const SCUTE_REFRESH_STORAGE_KEY = "sc-refresh-token";
export const SCUTE_REMEMBER_STORAGE_KEY = "sc-remember-me";

export const _SCUTE_ACCESS_HEADER = "X-Authorization";
export const _SCUTE_REFRESH_HEADER = "X-Refresh-Token";
