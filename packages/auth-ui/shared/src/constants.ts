import type { ValueOf } from "type-fest";

export const VIEWS = {
  SIGN_IN: "sign-in",
  SIGN_UP: "sign-up",
  BIO_REGISTER: "bio-register",
  BIO_VERIFY: "bio-verify",
  MAGIC_LOADING: "magic-loading",
  MAGIC_PENDING: "magic-pending",
  MAGIC_NEW_DEVICE_PENDING: "magic-new-device-pending",
} as const;

export type Views = ValueOf<typeof VIEWS>;
