/**
 * Shared test helpers for the @scute/nextjs-handlers characterization suite.
 * Not a test file itself (vitest only collects *.test.ts).
 *
 * Nothing here touches the real network: `createUpstream()` returns a fake
 * `fetch` that answers the handful of Scute API routes the Next.js layer
 * reaches, records every call, and returns 404 for anything else.
 */
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { RequestCookies } from "next/dist/server/web/spec-extension/cookies";
import {
  MutableRequestCookiesAdapter,
  RequestCookiesAdapter,
} from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { parse as parseSetCookie } from "set-cookie-parser";

export const APP_ID = "app-123";
export const OTHER_APP_ID = "app-999";
export const BASE_URL = "https://api.scute.test";
export const ORIGIN = "http://localhost:3000";
export const SECRET = "scute_secret_test_key";

export const ACCESS_KEY = `sc-access-token__${APP_ID}`;
export const REFRESH_KEY = `sc-refresh-token__${APP_ID}`;
export const LEGACY_ACCESS_KEY = "sc-access-token";
export const LEGACY_REFRESH_KEY = "sc-refresh-token";
export const CSRF_COOKIE = `X-CSRF-Token__${APP_ID}`;
export const LEGACY_CSRF_COOKIE = "X-CSRF-Token";

export const nowSec = () => Math.floor(Date.now() / 1000);

const b64url = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj)).toString("base64url");

/** Unsigned JWT; the SDK only decodes (jwt-decode), it never verifies. */
export const makeJwt = (payload: Record<string, unknown>, sig = "sig") =>
  `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url(payload)}.${sig}`;

export const makeAccess = (
  opts: { uuid?: string; expIn?: number; tag?: string } = {}
) =>
  makeJwt({
    uuid: opts.uuid ?? "user-1",
    exp: nowSec() + (opts.expIn ?? 900),
    ...(opts.tag ? { tag: opts.tag } : {}),
  });

export const makeRefresh = (opts: { expIn?: number; tag?: string } = {}) =>
  makeJwt({
    exp: nowSec() + (opts.expIn ?? 30 * 24 * 3600),
    ...(opts.tag ? { tag: opts.tag } : {}),
  });

export const APP_DATA = {
  id: APP_ID,
  name: "Test App",
  access_expiration: 900,
  refresh_expiration: 2592000,
  auto_refresh: true,
};

export type UpstreamCall = {
  url: string;
  path: string;
  method: string;
  headers: Headers;
  cache: RequestCache | undefined;
};

type RouteHandler = (call: UpstreamCall) => Response | Promise<Response>;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * Fake Scute API. Routes are keyed by `METHOD path` (path relative to
 * BASE_URL, without query). Override any route with `upstream.on(...)`.
 */
export const createUpstream = (appId: string = APP_ID) => {
  const calls: UpstreamCall[] = [];
  const issued = {
    rotateAccess: makeAccess({ tag: "rotated" }),
    rotateRefresh: makeRefresh({ tag: "rotated" }),
    refreshedAccess: makeAccess({ tag: "refreshed" }),
    refreshedRefresh: makeRefresh({ tag: "refreshed" }),
  };

  const routes = new Map<string, RouteHandler>([
    [`GET /v1/apps/${appId}`, () => json({ ...APP_DATA, id: appId })],
    [
      `POST /v1/auth/${appId}/tokens/rotate_access`,
      () =>
        json({
          access: issued.rotateAccess,
          refresh: issued.rotateRefresh,
          access_expires_at: "x",
        }),
    ],
    [
      `POST /v1/auth/${appId}/tokens/refresh`,
      () =>
        json({
          access: issued.refreshedAccess,
          refresh: issued.refreshedRefresh,
          access_expires_at: "x",
        }),
    ],
    [
      `DELETE /v1/auth/${appId}/current_user`,
      () => new Response(null, { status: 204 }),
    ],
    [
      `GET /v1/auth/${appId}/current_user`,
      () => json({ user: { id: "user-1", email: "u@example.com" } }),
    ],
  ]);

  const fetchImpl = vi.fn(async (input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const method = (init.method ?? input?.method ?? "GET").toUpperCase();
    const parsed = new URL(url, ORIGIN);
    const call: UpstreamCall = {
      url,
      path: parsed.pathname,
      method,
      headers: new Headers(init.headers ?? {}),
      cache: init.cache,
    };
    calls.push(call);
    const handler = routes.get(`${method} ${parsed.pathname}`);
    if (!handler) {
      return json({ error: "not found" }, 404);
    }
    return handler(call);
  });

  return {
    calls,
    issued,
    fetch: fetchImpl,
    on(method: string, path: string, handler: RouteHandler) {
      routes.set(`${method.toUpperCase()} ${path}`, handler);
    },
    /** calls whose path ends with the given suffix */
    callsTo(pathSuffix: string, method?: string) {
      return calls.filter(
        (c) =>
          c.path.endsWith(pathSuffix) &&
          (!method || c.method === method.toUpperCase())
      );
    },
    install() {
      vi.stubGlobal("fetch", fetchImpl);
      return this;
    },
  };
};

export type Upstream = ReturnType<typeof createUpstream>;

export type ParsedSetCookie = {
  name: string;
  value: string;
  path?: string;
  expires?: Date;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  domain?: string;
};

/** Parse raw Set-Cookie strings WITHOUT decoding values. */
export const parseCookies = (setCookies: string[]): ParsedSetCookie[] =>
  parseSetCookie(setCookies, { decodeValues: false }) as ParsedSetCookie[];

/** Last Set-Cookie for a name (browser semantics: last write wins). */
export const lastCookie = (setCookies: string[], name: string) =>
  parseCookies(setCookies)
    .filter((c) => c.name === name)
    .pop();

export const isDeletion = (c: ParsedSetCookie | undefined) =>
  !!c &&
  c.value === "" &&
  (c.maxAge === 0 ||
    (c.expires !== undefined && c.expires.getTime() <= Date.now()));

export const cookieHeader = (cookies: Record<string, string>) =>
  Object.entries(cookies)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("; ");

/**
 * App Router route handler / server action context built from Next's own
 * cookie adapters: `cookies()` is the mutable adapter Next hands to route
 * handlers, and `setCookies()` returns the serialized Set-Cookie strings
 * Next would attach to the response.
 */
export const makeRouteContext = (
  cookies: Record<string, string> = {},
  headers: Record<string, string> = {},
  opts: { asyncCookies?: boolean } = {}
) => {
  const reqHeaders = new Headers(headers);
  const cookieStr = cookieHeader(cookies);
  if (cookieStr) reqHeaders.set("cookie", cookieStr);
  let latest: string[] = [];
  const history: string[] = [];
  const store = MutableRequestCookiesAdapter.wrap(
    new RequestCookies(reqHeaders),
    (serialized: string[]) => {
      latest = serialized;
      history.push(...serialized);
    }
  );
  return {
    reqHeaders,
    store,
    context: {
      cookies: opts.asyncCookies
        ? async () => store as any
        : () => store as any,
      headers: () => reqHeaders,
    },
    setCookies: () => latest,
    /** every serialized Set-Cookie Next produced, including overwritten ones */
    cookieHistory: () => history,
  };
};

/** Read-only cookies() as Next hands them to server components. */
export const makeSealedCookies = (cookies: Record<string, string> = {}) => {
  const reqHeaders = new Headers();
  const cookieStr = cookieHeader(cookies);
  if (cookieStr) reqHeaders.set("cookie", cookieStr);
  return RequestCookiesAdapter.seal(new RequestCookies(reqHeaders));
};

export const makeNextRequest = (
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    body?: string;
  } = {}
) => {
  const headers = new Headers(init.headers ?? {});
  const cookieStr = cookieHeader(init.cookies ?? {});
  if (cookieStr) headers.set("cookie", cookieStr);
  return new NextRequest(new URL(path, ORIGIN), {
    method: init.method ?? "GET",
    headers,
    body: init.body,
  });
};

export const clientConfig = (extra: Record<string, unknown> = {}) => ({
  appId: APP_ID,
  baseUrl: BASE_URL,
  secretKey: SECRET,
  ...extra,
});

/** Let fire-and-forget promise chains inside the SDK settle. */
export const settle = async (rounds = 5) => {
  for (let i = 0; i < rounds; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
};

/**
 * Run `fn` with vitest's own unhandledRejection listeners detached and
 * return every rejection reason Node reported meanwhile. Used to pin SDK
 * code paths that leak unawaited rejections without failing the run.
 */
export const captureUnhandledRejections = async <T>(
  fn: () => Promise<T>
): Promise<{ result: T; reasons: unknown[] }> => {
  const saved = process.listeners("unhandledRejection");
  process.removeAllListeners("unhandledRejection");
  const reasons: unknown[] = [];
  const onRejection = (reason: unknown) => {
    reasons.push(reason);
  };
  process.on("unhandledRejection", onRejection);
  try {
    const result = await fn();
    await settle(10);
    return { result, reasons };
  } finally {
    process.off("unhandledRejection", onRejection);
    for (const l of saved) process.on("unhandledRejection", l as any);
  }
};
