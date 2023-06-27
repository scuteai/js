import type { BaseHttpError } from "../errors";

export type UniqueIdentifier = string | number;

export interface CookieAttributes {
  domain?: string;
  expires?: Date;
  maxAge?: number;
  path?: string;
  sameSite?: "strict" | "lax" | "none";
  httpOnly?: boolean;
  secure?: boolean;
}

export type BaseResponse<T = any> = Promise<
  | {
      data: T;
      error: null;
    }
  | {
      data: null;
      error: BaseHttpError;
    }
>;
