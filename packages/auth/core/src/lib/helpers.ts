import { supported as _isWebauthnSupported } from "./webauthn";
import _jwtDecode from "jwt-decode";
import { _SCUTE_ACCESS_HEADER, _SCUTE_REFRESH_HEADER } from "./constants";
import {
  _ScuteAccessPayload,
  _ScuteMagicLinkTokenPayload,
} from "./types/internal";

export const jwtDecode = _jwtDecode;

export const isBrowser = () =>
  typeof window !== "undefined" &&
  typeof window.document !== "undefined" &&
  typeof window.document.createElement !== "undefined";

export class Deferred<T> {
  promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (error?: Error) => void;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

// https://github.com/MasterKale/SimpleWebAuthn/blob/9757b8172d8d025eade46bd62be0e6c3c2216ea3/packages/browser/src/helpers/isValidDomain.ts
/**
 * A simple test to determine if a hostname is a properly-formatted domain name
 *
 * A "valid domain" is defined here: https://url.spec.whatwg.org/#valid-domain
 *
 * Regex sourced from here:
 * https://www.oreilly.com/library/view/regular-expressions-cookbook/9781449327453/ch08s15.html
 */
export function isValidDomain(hostname: string): boolean {
  return (
    // Consider localhost valid as well since it's okay wrt Secure Contexts
    hostname === "localhost" ||
    /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i.test(hostname)
  );
}

/**
 * Checks if the webauthn is supported in the browser
 */
export const isWebauthnSupported = () => isBrowser() && _isWebauthnSupported();

export const decodeAccessToken = (accessToken: string) => {
  try {
    const payload = jwtDecode<_ScuteAccessPayload>(accessToken);
    if (!payload.exp || !payload.uuid) {
      return null;
    }

    return {
      expiresAt: new Date(payload.exp * 1000),
      userId: payload.uuid as string,
    };
  } catch {
    return null;
  }
};

export const decodeRefreshToken = (refreshToken: string) => {
  try {
    const payload = jwtDecode<_ScuteAccessPayload>(refreshToken);
    if (!payload.exp) {
      return null;
    }

    return {
      expiresAt: new Date(payload.exp * 1000),
    };
  } catch {
    return null;
  }
};

export const decodeMagicLinkToken = (token: string) => {
  try {
    const payload = jwtDecode<_ScuteMagicLinkTokenPayload>(token);
    if (payload.uuid === undefined || payload.webauthnEnabled === undefined) {
      return null;
    }

    return {
      webauthnEnabled: payload.webauthnEnabled,
      uuid: payload.uuid,
    };
  } catch {
    return null;
  }
};

/**
 * Get access token header object.
 */
export const accessTokenHeader = (jwt: string | null): HeadersInit => {
  if (!jwt) return {};

  return {
    [_SCUTE_ACCESS_HEADER]: jwt,
  };
};

/**
 * Get refresh token headers object.
 */
export const refreshTokenHeaders = (jwt: string | null): HeadersInit => {
  if (!jwt) return {};

  return {
    [_SCUTE_REFRESH_HEADER]: jwt,
  };
};
