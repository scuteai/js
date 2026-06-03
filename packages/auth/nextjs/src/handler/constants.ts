export const internalPrefix = "auth";

export const CSRF_HANDLER = "csrf";
export const REFRESH_HANDLER = "refresh";
export const SIGN_IN_HANDLER = "sign-in";
export const SIGN_OUT_HANDLER = "sign-out";

// Header name stays plain (HTTP header collision is harmless — each request
// carries one). Only the COOKIE name needs to be per-app to keep multiple
// Scute apps on the same host from clobbering each other's CSRF tokens in
// the shared cookie jar. Mirrors the scopedKey pattern in @scute/js-core.
export const CSRF_TOKEN_KEY = "X-CSRF-Token";

/**
 * Per-app CSRF cookie name. `${CSRF_TOKEN_KEY}__${appId}`. Use the legacy
 * unsuffixed name as a fallback on read for live users mid-migration.
 */
export const csrfCookieKey = (appId: string | number): string => {
  if (!appId) {
    throw new Error("csrfCookieKey called without an appId");
  }
  return `${CSRF_TOKEN_KEY}__${appId}`;
};

/** Original unsuffixed CSRF cookie. Only kept for legacy-fallback reads. */
export const CSRF_TOKEN_KEY_LEGACY = CSRF_TOKEN_KEY;