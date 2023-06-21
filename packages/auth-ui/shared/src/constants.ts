import type { ValueOf } from "type-fest";

export const VIEWS = {
  LOGIN: "login",
  BIO_REGISTER: "bio-register",
  BIO_VERIFY: "bio-verify",
  MAGIC_LOADING: "magic-loading",
  MAGIC_PENDING: "magic-pending",
} as const;

export type Views = ValueOf<typeof VIEWS>;