import type { ValueOf } from "type-fest";
import type { Session } from "./types";

export const AUTH_CHANGE_EVENTS = {
  INITIAL_SESSION: "initial_session",
  SIGN_IN: "sign_in",
  SIGN_OUT: "sign_out",
  TOKEN_REFRESH: "token_refresh",
  MAGIC_LOADING: "magic_loading",
  MAGIC_NEW_DEVICE_PENDING: "magic_new_device_pending",
  MAGIC_PENDING: "magic_pending",
  BIO_REGISTER: "bio_register",
  BIO_VERIFY: "bio_verify",
} as const;

export type AuthChangeEvent = ValueOf<typeof AUTH_CHANGE_EVENTS>;

const AUTH_STATE_CHANGED = "authStateChanged";

export const INTERNAL_EVENTS = {
  AUTH_STATE_CHANGED,
} as const;

export type InternalEvent = {
  [AUTH_STATE_CHANGED]: {
    event: AuthChangeEvent;
    session?: Session;
    _broadcasted?: boolean;
  };
};

export const SCUTE_BROADCAST_CHANNEL = "scute-broadcast";
export const SCUTE_MAGIC_PARAM = "sct_magic";

export const SCUTE_ACCESS_STORAGE_KEY = "sc-access-token";
export const SCUTE_REFRESH_STORAGE_KEY = "sc-refresh-token";
export const SCUTE_USER_STORAGE_KEY = "scu_user";
export const SCUTE_CSRF_STORAGE_KEY = "X-CSRF-Token";
