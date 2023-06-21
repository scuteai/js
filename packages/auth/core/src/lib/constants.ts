import type { ValueOf } from "type-fest";

export const AUTH_CHANGE_EVENTS = {
  INITIAL_SESSION: "initial_session",
  SIGN_IN: "sign_in",
  SIGN_OUT: "sign_out",
  MAGIC_LOADING: "magic_loading",
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
    _broadcasted?: boolean;
  };
};

export const SCUTE_BROADCAST_CHANNEL = "scute-broadcast";
export const SCUTE_MAGIC_PARAM = "sct_magic";
