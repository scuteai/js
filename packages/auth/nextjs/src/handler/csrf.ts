import { serialize as serializeCookie } from "cookie";
import { randomBytes } from "../utils";
import {
  CSRF_TOKEN_KEY,
  CSRF_TOKEN_KEY_LEGACY,
  csrfCookieKey,
} from "./constants";

export const createCsrfToken = () => {
  const token = randomBytes(64).toString("hex");
  return token;
};

// Per-app namespacing on the COOKIE name (not the header). Without this,
// two Scute apps loaded on the same origin (e.g. dashboard at :3000 and
// an integrator demo at :3004) would share one CSRF cookie via the
// port-blind cookie jar and clobber each other on every CSRF round-trip.

export const setCsrfToken = (
  token: string,
  response: Response,
  appId: string | number
) => {
  const cookieStr = serializeCookie(csrfCookieKey(appId), token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  response.headers.append("set-cookie", cookieStr);
  response.headers.append("cookie", cookieStr);

  // Also clear any legacy unsuffixed cookie this jar may still hold from a
  // pre-namespacing client. Without this, the new namespaced cookie sits
  // alongside the stale legacy one and the legacy-fallback read keeps
  // picking up the wrong app's token.
  response.headers.append(
    "set-cookie",
    serializeCookie(CSRF_TOKEN_KEY_LEGACY, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    })
  );
};

export const deleteCsrfToken = (
  response: Response,
  appId: string | number
) => {
  const cookieStr = serializeCookie(csrfCookieKey(appId), "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
  response.headers.append("set-cookie", cookieStr);
  response.headers.append("cookie", cookieStr);
  // Symmetric legacy clear — same reason as in setCsrfToken.
  response.headers.append(
    "set-cookie",
    serializeCookie(CSRF_TOKEN_KEY_LEGACY, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    })
  );
};

export const isCsrfTokenValid = ({
  cookies,
  headers,
  appId,
}: {
  cookies: Record<string, string | null>;
  headers: Headers;
  appId: string | number;
}) => {
  // Prefer the namespaced cookie; fall through to the legacy unsuffixed one
  // for the migration window. The header name stays plain — the client just
  // round-trips the token value, not the cookie name.
  const csrfTokenCookie =
    cookies[csrfCookieKey(appId)] ?? cookies[CSRF_TOKEN_KEY_LEGACY];
  const csrfTokenHeader = headers.get(CSRF_TOKEN_KEY);

  if (
    csrfTokenCookie &&
    csrfTokenCookie.trim().length !== 0 &&
    csrfTokenHeader &&
    csrfTokenHeader.trim().length !== 0 &&
    csrfTokenCookie === csrfTokenHeader
  ) {
    return true;
  } else {
    return false;
  }
};

export const getCsrfErrorResponse = () => {
  return new Response("CSRF error", {
    status: 401,
  });
};
