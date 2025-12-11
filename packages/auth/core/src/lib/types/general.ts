import type { BaseHttpError } from "../errors";

export type UniqueIdentifier = string | number;

export type Promisable<T> = T | Promise<T>;

export interface CookieAttributes {
  domain?: string;
  expires?: Date;
  maxAge?: number;
  path?: string;
  sameSite?: "strict" | "lax" | "none";
  httpOnly?: boolean;
  secure?: boolean;
}

export type BaseResponse<T = any, K = BaseHttpError> = Promise<
  | {
      data: T;
      error: null;
    }
  | {
      data: null;
      error: K;
    }
>;