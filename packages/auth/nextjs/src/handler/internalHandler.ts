import { ScuteClient, ScuteTokenPayload } from "@scute/js-core";
import {
  createCsrfToken,
  deleteCsrfToken,
  getCsrfErrorResponse,
  isCsrfTokenValid,
  setCsrfToken,
} from "./csrf";
import { getHandlerPath } from "./handlerHelpers";
import {
  CSRF_HANDLER,
  CSRF_TOKEN_KEY,
  CSRF_TOKEN_KEY_LEGACY,
  csrfCookieKey,
  REFRESH_HANDLER,
  SIGN_IN_HANDLER,
  SIGN_OUT_HANDLER,
} from "./constants";
import { decodeJwtPayload } from "../utils";

// Sign-in only accepts an access token issued within this window (30 seconds).
const SIGN_IN_MAX_DELAY_MS = 30 * 1000;

const getBearerToken = (headers: Headers) => {
  const authorization = headers.get("Authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
};

/**
 * True when `token` is a decodable, unexpired access token issued within
 * SIGN_IN_MAX_DELAY_MS of now. Scute access tokens carry `exp` but no `iat`,
 * so the issue time falls back to `exp - access_expiration`.
 */
const isFreshAccessToken = (token: string, accessExpiration: unknown) => {
  const claims = decodeJwtPayload(token);
  if (!claims || !claims.uuid || typeof claims.exp !== "number") {
    return false;
  }

  const issuedAt =
    typeof claims.iat === "number"
      ? claims.iat
      : typeof accessExpiration === "number"
      ? claims.exp - accessExpiration
      : NaN;
  const now = Date.now();

  return (
    claims.exp * 1000 > now &&
    Math.abs(now - issuedAt * 1000) <= SIGN_IN_MAX_DELAY_MS
  );
};

const internalHandler = async (
  scute: ScuteClient,
  {
    url,
    method,
    query,
    body,
    cookies,
    headers,
  }: {
    url: URL;
    method: string;
    query: Record<string, string>;
    body: Record<string, any> | undefined;
    cookies: Record<string, string>;
    headers: Headers;
  }
): Promise<Response> => {
  // The scute client knows its appId — needed to pick the right namespaced
  // CSRF cookie. See csrf.ts + constants.ts.
  const appId = scute.appId as string;

  if (isSignInRequest(url, method)) {
    if (!isCsrfTokenValid({ cookies, headers, appId })) {
      const response = getCsrfErrorResponse();
      return response;
    }

    const presented = getBearerToken(headers);
    const { data: appData } = presented ? await scute.getAppData() : { data: null };

    // Validate before touching the session: a refused sign-in leaves the
    // session already in these cookies as it was.
    if (
      !presented ||
      !appData ||
      !isFreshAccessToken(presented, appData.access_expiration)
    ) {
      return new Response(null, {
        status: 401,
      });
    }

    // Start from a clean slate: session cookies already present for this
    // app (namespaced or legacy) must never stand in for the presented token.
    await scute["removeSession"]();

    // Exchange exactly the presented token; sets the refresh token http-only.
    const { data: tokens, error } = await scute.admin.refreshWithAccess(
      presented
    );
    const session = error ? null : await scute["setSession"](tokens);

    if (!session?.access) {
      return new Response(null, {
        status: 401,
      });
    }

    return new Response(null, {
      status: 200,
    });
  } else if (isSignOutRequest(url, method)) {
    if (!isCsrfTokenValid({ cookies, headers, appId })) {
      const response = getCsrfErrorResponse();
      return response;
    }

    const response = new Response(null, {
      status: 200,
    });

    deleteCsrfToken(response, appId);

    await scute.signOut();

    return response;
  } else if (isCsrfRequest(url, method)) {
    // Prefer the namespaced cookie; fall through to the legacy unsuffixed
    // one so a mid-migration tab keeps its token instead of being forced
    // through a fresh round-trip on first read.
    // An empty cookie counts as none: an empty token would fail every
    // CSRF check after it (sign-in, refresh, sign-out).
    const token =
      cookies[csrfCookieKey(appId)] ||
      cookies[CSRF_TOKEN_KEY_LEGACY] ||
      createCsrfToken();

    const response = new Response(token, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });

    setCsrfToken(token, response, appId);

    return response;
  } else if (isRefreshRequest(url, method)) {
    if (!isCsrfTokenValid({ cookies, headers, appId })) {
      const response = getCsrfErrorResponse();
      return response;
    }

    const session = await scute["initialSessionState"]();
    if (!session.refresh) {
      // No refresh cookie. Minting a session from the JS-readable access
      // cookie alone is held to the same rule as sign-in: only an access
      // token issued in the last 30 seconds may be exchanged. No session at
      // all is a plain 401.
      const { data: appData } = session.access
        ? await scute.getAppData()
        : { data: null };
      if (
        !session.access ||
        !appData ||
        !isFreshAccessToken(session.access, appData.access_expiration)
      ) {
        return new Response(null, {
          status: 401,
        });
      }
    }

    const { data, error } = await scute.refreshSession();

    const refusal = networkRefusalOf(error);
    if (refusal) {
      // D11: the workspace's IP or country rules refused the network this
      // refresh came from, not the session. Keep the cookies; the same
      // session refreshes again from an allowed network.
      return new Response(JSON.stringify({ error_code: refusal }), {
        status: 403,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    if (error && !isRefreshRejected(error)) {
      // A 5xx or a dropped connection says nothing about the session. Keep
      // the cookies so the next refresh can succeed: 502 for an upstream
      // error status, 503 when upstream could not be reached.
      return new Response(null, {
        status: hasHttpStatus(error) ? 502 : 503,
      });
    }

    if (error || !data?.access) {
      // A backend-rejected refresh means the stored refresh token is dead:
      // a stale `sc-refresh-token__<appId>` cookie force-migrated from a
      // pre-0.7 legacy slot, a revoked/cleaned-up session, or a flushed token
      // store. Clear the session (namespaced and legacy cookies) so the SDK
      // stops looping on the dead token and the user lands on a clean login
      // instead of an infinite refresh / 401 loop. signOut is best-effort: a
      // failed server call must not block the local cookie clear.
      try {
        await scute.signOut();
      } catch {}
      // No body, so no Content-Type: a JSON type with an empty body breaks
      // a caller that parses it.
      return new Response(null, {
        status: 401,
      });
    }

    return new Response(
      JSON.stringify({
        access: data.access,
        access_expires_at: data.accessExpiresAt?.toString(),
      } as Partial<ScuteTokenPayload>),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } else {
    return badRequest();
  }
};

const hasHttpStatus = (error: unknown) =>
  typeof (error as { code?: unknown } | null)?.code === "number";

/**
 * Upstream refused the refresh token itself (a 4xx other than a timeout or
 * rate limit), so the session is dead. 5xx and network errors are transient.
 */
const isRefreshRejected = (error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "invalid-auth-token") return true;
  return (
    typeof code === "number" &&
    code >= 400 &&
    code < 500 &&
    code !== 408 &&
    code !== 429
  );
};

/** A refresh refused for the network it came from (D11), not the session. */
const networkRefusalOf = (error: unknown): "ip_blocked" | "country_blocked" | null => {
  const json = (error as { code?: unknown; json?: { error_code?: unknown } } | null) ?? null;
  const code = json?.json?.error_code;
  return json?.code === 403 && (code === "ip_blocked" || code === "country_blocked") ? code : null;
};

const isSignInRequest = (url: URL, method: string) =>
  method === "POST" && url.pathname.endsWith(getHandlerPath(SIGN_IN_HANDLER));

const isSignOutRequest = (url: URL, method: string) =>
  method === "POST" && url.pathname.endsWith(getHandlerPath(SIGN_OUT_HANDLER));

const isCsrfRequest = (url: URL, method: string) =>
  method === "GET" && url.pathname.endsWith(getHandlerPath(CSRF_HANDLER));

const isRefreshRequest = (url: URL, method: string) =>
  method === "POST" && url.pathname.endsWith(getHandlerPath(REFRESH_HANDLER));

/**
 * True when `url` + `method` name one of the handler's endpoints. Callers
 * check this before constructing a ScuteClient, so an unknown path costs no
 * upstream call (the client's constructor fetches the app data).
 */
export const isHandlerRoute = (url: URL, method: string) =>
  isSignInRequest(url, method) ||
  isSignOutRequest(url, method) ||
  isCsrfRequest(url, method) ||
  isRefreshRequest(url, method);

export const badRequest = () =>
  new Response("Bad Request", {
    status: 400,
  });

export default internalHandler;
