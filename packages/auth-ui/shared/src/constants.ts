import type { ValueOf } from "type-fest";

export const VIEWS = {
  SIGN_IN_OR_UP: "sign-in-or-up",
  SIGN_IN: "sign-in",
  SIGN_UP: "sign-up",
  CONFIRM_INVITE: "confirm-invite",
  WEBAUTHN_REGISTER: "webauthn-register",
  WEBAUTHN_VERIFY: "webauthn-verify",
  MAGIC_LOADING: "magic-loading",
  MAGIC_PENDING: "magic-pending",
  MAGIC_NEW_DEVICE_PENDING: "magic-new-device-pending",
  PKCE_OAUTH: "pkce-oauth",
} as const;

export type Views = ValueOf<typeof VIEWS>;
