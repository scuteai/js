/**
 * internalHandler: routing + the four auth endpoints, driven directly with
 * a route-handler (App Router) ScuteClient whose cookies() is Next's own
 * mutable cookie adapter. `setCookies` below is what Next would attach to
 * the outgoing response; `res.headers.getSetCookie()` is what the handler
 * itself adds.
 */
import internalHandler from "../internalHandler";
import { createRouteHandlerClient } from "../../routeHandlerClient";
import {
  ACCESS_KEY,
  APP_ID,
  CSRF_COOKIE,
  LEGACY_ACCESS_KEY,
  LEGACY_CSRF_COOKIE,
  LEGACY_REFRESH_KEY,
  ORIGIN,
  REFRESH_KEY,
  SECRET,
  clientConfig,
  createUpstream,
  isDeletion,
  json,
  lastCookie,
  makeAccess,
  makeJwt,
  makeRefresh,
  makeRouteContext,
  settle,
  captureUnhandledRejections,
  type Upstream,
} from "../../__tests__/_support";

const CSRF = "c".repeat(128);

let upstream: Upstream;

beforeEach(() => {
  upstream = createUpstream().install();
});

afterEach(async () => {
  await settle();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

type RunOpts = {
  path: string;
  method?: string;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  csrf?: boolean;
};

const run = async ({ path, method = "POST", cookies = {}, headers = {}, csrf = false }: RunOpts) => {
  const allCookies = csrf ? { [CSRF_COOKIE]: CSRF, ...cookies } : cookies;
  const allHeaders = csrf ? { "X-CSRF-Token": CSRF, ...headers } : headers;
  const ctx = makeRouteContext(allCookies, allHeaders);
  const scute = createRouteHandlerClient({ cookies: ctx.context.cookies }, clientConfig());
  const res = await internalHandler(scute, {
    url: new URL(path, ORIGIN),
    method,
    query: {},
    body: undefined,
    cookies: allCookies,
    headers: new Headers(allHeaders),
  });
  await settle();
  return {
    res,
    scute,
    body: await res.text(),
    setCookies: ctx.setCookies(),
    responseSetCookies: res.headers.getSetCookie(),
  };
};

const nonAppDataCalls = () =>
  upstream.calls.filter((c) => c.path !== `/v1/apps/${APP_ID}`);

describe("routing", () => {
  it.each([
    ["GET", "/auth/csrf", 200],
    ["POST", "/auth/csrf", 400],
    ["PUT", "/auth/csrf", 400],
    ["HEAD", "/auth/csrf", 400],
    ["OPTIONS", "/auth/csrf", 400],
    ["GET", "/auth/sign-in", 400],
    ["GET", "/auth/sign-out", 400],
    ["GET", "/auth/refresh", 400],
    ["PUT", "/auth/refresh", 400],
    ["DELETE", "/auth/sign-out", 400],
    ["PATCH", "/auth/sign-in", 400],
    ["OPTIONS", "/auth/sign-in", 400],
  ])("%s %s -> %i", async (method, path, status) => {
    const { res, body } = await run({ method, path });
    expect(res.status).toBe(status);
    if (status === 400) expect(body).toBe("Bad Request");
  });

  it("is case-sensitive on the method (lowercase 'post' is a 400)", async () => {
    const { res } = await run({ method: "post", path: "/auth/sign-out", csrf: true });
    expect(res.status).toBe(400);
  });

  it.each([
    "/auth",
    "/",
    "/auth/unknown",
    "/auth/csrf/",
    "/auth/CSRF",
    "/Auth/csrf",
    "/auth/%63srf",
    "/auth//csrf",
    "/auth/csrf.json",
    "/foo%2Fauth/csrf",
    "/xauth/csrf",
  ])("GET %s -> 400 (exact suffix match only)", async (path) => {
    const { res, body, responseSetCookies } = await run({ method: "GET", path });
    expect(res.status).toBe(400);
    expect(body).toBe("Bad Request");
    expect(responseSetCookies).toEqual([]);
  });

  // CURRENT BEHAVIOR: routing is `pathname.endsWith("/auth/<handler>")`, so
  // the handler answers under ANY prefix, not just where it is mounted.
  // Harmless for a catch-all route file, but worth knowing for REF-42.
  it.each([
    "/api/auth/csrf",
    "/some/deep/nested/auth/csrf",
    "/auth/sign-in/auth/csrf",
    "/auth/csrf?next=https://evil.example",
    "/a/../auth/csrf",
  ])("GET %s is treated as the csrf endpoint", async (path) => {
    const { res, body } = await run({ method: "GET", path });
    expect(res.status).toBe(200);
    expect(body).toMatch(/^[0-9a-f]{128}$/);
  });

  it("unknown routes make no upstream call besides the constructor's app-data GET", async () => {
    await run({ method: "POST", path: "/auth/../../v1/apps/other/users" });
    await run({ method: "DELETE", path: "/auth/users/1" });
    expect(nonAppDataCalls()).toEqual([]);
    for (const c of upstream.calls) {
      expect(c.url).toBe(`https://api.scute.test/v1/apps/${APP_ID}`);
      expect(c.method).toBe("GET");
    }
  });

  it("never answers with a redirect", async () => {
    for (const [method, path] of [
      ["GET", "/auth/csrf?redirect=https://evil.example"],
      ["POST", "/auth/sign-in?next=//evil.example"],
      ["POST", "/auth/sign-out?returnTo=https://evil.example"],
      ["GET", "/auth/whatever?url=https://evil.example"],
    ]) {
      const { res } = await run({ method, path, csrf: true });
      expect(res.status < 300 || res.status >= 400).toBe(true);
      expect(res.headers.get("location")).toBeNull();
    }
  });
});

describe("GET /auth/csrf", () => {
  it("mints a fresh 128-hex token, returns it in the body and sets it HttpOnly", async () => {
    const { res, body, responseSetCookies, setCookies } = await run({ method: "GET", path: "/auth/csrf" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain;charset=UTF-8");
    expect(body).toMatch(/^[0-9a-f]{128}$/);
    expect(responseSetCookies).toEqual([
      `${CSRF_COOKIE}=${body}; Path=/; HttpOnly; SameSite=Lax`,
      `${LEGACY_CSRF_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
    ]);
    // nothing written through the session cookie store
    expect(setCookies).toEqual([]);
  });

  it("does not rotate: returns the existing namespaced token", async () => {
    const { body, responseSetCookies } = await run({
      method: "GET",
      path: "/auth/csrf",
      cookies: { [CSRF_COOKIE]: "existing-token" },
    });
    expect(body).toBe("existing-token");
    expect(responseSetCookies[0]).toBe(
      `${CSRF_COOKIE}=existing-token; Path=/; HttpOnly; SameSite=Lax`
    );
  });

  // CURRENT BEHAVIOR (REF-41 target): a legacy unsuffixed token is adopted
  // as this app's token and re-issued under the namespaced name.
  it("adopts a legacy unsuffixed token and migrates it to the namespaced cookie", async () => {
    const { body, responseSetCookies } = await run({
      method: "GET",
      path: "/auth/csrf",
      cookies: { [LEGACY_CSRF_COOKIE]: "legacy-token" },
    });
    expect(body).toBe("legacy-token");
    expect(responseSetCookies).toEqual([
      `${CSRF_COOKIE}=legacy-token; Path=/; HttpOnly; SameSite=Lax`,
      `${LEGACY_CSRF_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
    ]);
  });

  it("prefers the namespaced token over the legacy one", async () => {
    const { body } = await run({
      method: "GET",
      path: "/auth/csrf",
      cookies: { [CSRF_COOKIE]: "ns", [LEGACY_CSRF_COOKIE]: "legacy" },
    });
    expect(body).toBe("ns");
  });

  it("ignores another app's namespaced token", async () => {
    const { body } = await run({
      method: "GET",
      path: "/auth/csrf",
      cookies: { "X-CSRF-Token__other-app": "other" },
    });
    expect(body).not.toBe("other");
    expect(body).toMatch(/^[0-9a-f]{128}$/);
  });

  // Known limitation, tracked separately: an empty namespaced cookie is
  // returned as an empty token instead of minting a new one.
  it("returns an empty token when the namespaced cookie is present but empty", async () => {
    const { body } = await run({
      method: "GET",
      path: "/auth/csrf",
      cookies: { [CSRF_COOKIE]: "" },
    });
    expect(body).toBe("");
  });

  it("needs no CSRF header and makes no upstream token call", async () => {
    await run({ method: "GET", path: "/auth/csrf" });
    expect(nonAppDataCalls()).toEqual([]);
  });
});

describe("POST /auth/sign-in", () => {
  it("rejects without a CSRF header/cookie pair (401, no upstream token call, no cookies)", async () => {
    const access = makeAccess();
    const { res, body, setCookies } = await run({
      path: "/auth/sign-in",
      headers: { Authorization: `Bearer ${access}` },
    });
    expect(res.status).toBe(401);
    expect(body).toBe("CSRF error");
    expect(nonAppDataCalls()).toEqual([]);
    expect(setCookies).toEqual([]);
  });

  it("exchanges the bearer access token via rotate_access and sets session cookies", async () => {
    const presented = makeAccess({ tag: "presented" });
    const { res, body, setCookies, responseSetCookies } = await run({
      path: "/auth/sign-in",
      headers: { Authorization: `Bearer ${presented}` },
      csrf: true,
    });

    expect(res.status).toBe(200);
    expect(body).toBe("");
    expect(responseSetCookies).toEqual([]);

    const rotate = upstream.callsTo("/tokens/rotate_access", "POST");
    expect(rotate).toHaveLength(1);
    expect(rotate[0].url).toBe(`https://api.scute.test/v1/auth/${APP_ID}/tokens/rotate_access`);
    expect(rotate[0].headers.get("x-authorization")).toBe(presented);
    expect(rotate[0].headers.get("authorization")).toBe(`Bearer ${SECRET}`);

    const access = lastCookie(setCookies, ACCESS_KEY)!;
    const refresh = lastCookie(setCookies, REFRESH_KEY)!;
    expect(access.value).toBe(upstream.issued.rotateAccess);
    expect(access.httpOnly).toBeUndefined();
    expect(access.sameSite).toBe("lax");
    expect(access.path).toBe("/");
    expect(access.secure).toBeUndefined();
    expect(access.expires).toBeInstanceOf(Date);

    expect(refresh.value).toBe(upstream.issued.rotateRefresh);
    expect(refresh.httpOnly).toBe(true);
    expect(refresh.sameSite).toBe("lax");
    expect(refresh.path).toBe("/");
    expect(refresh.expires).toBeInstanceOf(Date);

    // only namespaced names get a value; legacy ones are only ever cleared
    for (const name of [LEGACY_ACCESS_KEY, LEGACY_REFRESH_KEY]) {
      expect(isDeletion(lastCookie(setCookies, name))).toBe(true);
    }
  });

  it("sets Expires from the JWT exp claim", async () => {
    const { setCookies } = await run({
      path: "/auth/sign-in",
      headers: { Authorization: `Bearer ${makeAccess()}` },
      csrf: true,
    });
    const exp = JSON.parse(
      Buffer.from(upstream.issued.rotateAccess.split(".")[1], "base64url").toString()
    ).exp;
    expect(lastCookie(setCookies, ACCESS_KEY)!.expires!.getTime()).toBe(exp * 1000);
  });

  it("adds Secure to session cookies in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { setCookies } = await run({
      path: "/auth/sign-in",
      headers: { Authorization: `Bearer ${makeAccess()}` },
      csrf: true,
    });
    expect(lastCookie(setCookies, ACCESS_KEY)!.secure).toBe(true);
    expect(lastCookie(setCookies, REFRESH_KEY)!.secure).toBe(true);
  });

  it("401s when the Authorization header is not 'Bearer <jwt>' and calls no token endpoint", async () => {
    for (const auth of [undefined, `bearer ${makeAccess()}`, "Basic abc", "Bearer not-a-jwt"]) {
      upstream.calls.length = 0;
      const { res } = await run({
        path: "/auth/sign-in",
        headers: auth ? { Authorization: auth } : {},
        csrf: true,
      });
      expect(res.status).toBe(401);
      expect(upstream.callsTo("/tokens/rotate_access")).toEqual([]);
      expect(upstream.callsTo("/tokens/refresh")).toEqual([]);
    }
  });

  it("401s and clears cookies when upstream rejects the access token", async () => {
    upstream.on("POST", `/v1/auth/${APP_ID}/tokens/rotate_access`, () =>
      json({ error: "invalid token" }, 401)
    );
    const { res, body, setCookies } = await run({
      path: "/auth/sign-in",
      headers: { Authorization: `Bearer ${makeAccess()}` },
      csrf: true,
    });
    expect(res.status).toBe(401);
    expect(body).toBe("");
    expect(isDeletion(lastCookie(setCookies, ACCESS_KEY))).toBe(true);
    expect(isDeletion(lastCookie(setCookies, LEGACY_ACCESS_KEY))).toBe(true);
  });

  // SIGN_IN_MAX_DELAY_MS: only an access token issued in the last 30s may
  // be exchanged. Scute access tokens have no `iat`, so the issue time is
  // `exp - access_expiration` (APP_DATA.access_expiration is 900s here).
  it.each([
    ["issued 31s ago", 900 - 31],
    ["issued ~15 minutes ago", 5],
    ["expired an hour ago", -3600],
    ["claiming to be issued 2 minutes in the future", 900 + 120],
  ])("rejects a presented access token %s: 401, no upstream token call, session cleared", async (_label, expIn) => {
    const presented = makeAccess({ expIn, tag: `presented${expIn}` });
    const { res, body, setCookies } = await run({
      path: "/auth/sign-in",
      headers: { Authorization: `Bearer ${presented}` },
      cookies: { [ACCESS_KEY]: makeAccess({ tag: "existing" }), [REFRESH_KEY]: makeRefresh({ tag: "existing" }) },
      csrf: true,
    });
    expect(res.status).toBe(401);
    expect(body).toBe("");
    expect(upstream.callsTo("/tokens/")).toEqual([]);
    expect(upstream.callsTo("/current_user")).toEqual([]);
    expect(isDeletion(lastCookie(setCookies, ACCESS_KEY))).toBe(true);
    expect(isDeletion(lastCookie(setCookies, REFRESH_KEY))).toBe(true);
  });

  it("accepts a presented access token issued within the last 30s", async () => {
    const presented = makeAccess({ expIn: 900 - 20, tag: "recent" });
    const { res, setCookies } = await run({
      path: "/auth/sign-in",
      headers: { Authorization: `Bearer ${presented}` },
      csrf: true,
    });
    expect(res.status).toBe(200);
    expect(upstream.callsTo("/tokens/rotate_access")[0].headers.get("x-authorization")).toBe(presented);
    expect(lastCookie(setCookies, REFRESH_KEY)!.value).toBe(upstream.issued.rotateRefresh);
  });

  it("uses an `iat` claim when the presented token has one", async () => {
    const now = Math.floor(Date.now() / 1000);
    const stale = makeJwt({ uuid: "user-1", iat: now - 60, exp: now + 900 });
    const fresh = makeJwt({ uuid: "user-1", iat: now - 5, exp: now + 3600 });
    expect((await run({ path: "/auth/sign-in", headers: { Authorization: `Bearer ${stale}` }, csrf: true })).res.status).toBe(401);
    expect(upstream.callsTo("/tokens/rotate_access")).toEqual([]);
    expect((await run({ path: "/auth/sign-in", headers: { Authorization: `Bearer ${fresh}` }, csrf: true })).res.status).toBe(200);
    expect(upstream.callsTo("/tokens/rotate_access")[0].headers.get("x-authorization")).toBe(fresh);
  });

  it("rejects a decodable JWT without the access token claims (uuid, exp)", async () => {
    const now = Math.floor(Date.now() / 1000);
    for (const token of [makeJwt({ exp: now + 900 }), makeJwt({ uuid: "user-1" }), makeJwt({ uuid: "user-1", exp: String(now + 900) })]) {
      const { res } = await run({ path: "/auth/sign-in", headers: { Authorization: `Bearer ${token}` }, csrf: true });
      expect(res.status).toBe(401);
    }
    expect(upstream.callsTo("/tokens/")).toEqual([]);
  });

  it("exchanges the presented token even when a refresh cookie already exists, and replaces it", async () => {
    const presented = makeAccess({ uuid: "user-B", tag: "B" });
    const existing = makeRefresh({ tag: "user-A" });
    const { res, setCookies } = await run({
      path: "/auth/sign-in",
      headers: { Authorization: `Bearer ${presented}` },
      cookies: { [REFRESH_KEY]: existing },
      csrf: true,
    });
    expect(res.status).toBe(200);
    expect(upstream.callsTo("/tokens/refresh")).toEqual([]);
    const rotate = upstream.callsTo("/tokens/rotate_access", "POST");
    expect(rotate).toHaveLength(1);
    expect(rotate[0].headers.get("x-authorization")).toBe(presented);
    expect(lastCookie(setCookies, ACCESS_KEY)!.value).toBe(upstream.issued.rotateAccess);
    expect(lastCookie(setCookies, REFRESH_KEY)!.value).toBe(upstream.issued.rotateRefresh);
  });

  it("clears an existing refresh cookie when rotate_access returns no refresh token", async () => {
    upstream.on("POST", `/v1/auth/${APP_ID}/tokens/rotate_access`, () =>
      json({ access: upstream.issued.rotateAccess, access_expires_at: "x" })
    );
    const { res, setCookies } = await run({
      path: "/auth/sign-in",
      headers: { Authorization: `Bearer ${makeAccess()}` },
      cookies: { [REFRESH_KEY]: makeRefresh({ tag: "existing" }) },
      csrf: true,
    });
    expect(res.status).toBe(200);
    expect(lastCookie(setCookies, ACCESS_KEY)!.value).toBe(upstream.issued.rotateAccess);
    expect(isDeletion(lastCookie(setCookies, REFRESH_KEY))).toBe(true);
  });

  it("ignores legacy unsuffixed session cookies during sign-in and clears them", async () => {
    upstream.on("POST", `/v1/auth/${APP_ID}/tokens/refresh`, () => json({ error: "revoked" }, 401));
    const { res, setCookies } = await run({
      path: "/auth/sign-in",
      headers: { Authorization: `Bearer ${makeAccess()}` },
      cookies: { [LEGACY_ACCESS_KEY]: makeAccess({ tag: "legacy" }), [LEGACY_REFRESH_KEY]: makeRefresh({ tag: "legacy" }) },
      csrf: true,
    });
    expect(res.status).toBe(200);
    expect(upstream.callsTo("/tokens/refresh")).toEqual([]);
    expect(upstream.callsTo("/tokens/rotate_access")).toHaveLength(1);
    expect(isDeletion(lastCookie(setCookies, LEGACY_ACCESS_KEY))).toBe(true);
    expect(isDeletion(lastCookie(setCookies, LEGACY_REFRESH_KEY))).toBe(true);
    expect(lastCookie(setCookies, REFRESH_KEY)!.value).toBe(upstream.issued.rotateRefresh);
  });

  it("401s before minting a session upstream when app data is unavailable", async () => {
    upstream.on("GET", `/v1/apps/${APP_ID}`, () => json({ error: "boom" }, 500));
    const { res, setCookies } = await run({
      path: "/auth/sign-in",
      headers: { Authorization: `Bearer ${makeAccess()}` },
      csrf: true,
    });
    expect(res.status).toBe(401);
    expect(upstream.callsTo("/tokens/rotate_access")).toEqual([]);
    expect(upstream.callsTo("/current_user", "DELETE")).toEqual([]);
    expect(isDeletion(lastCookie(setCookies, ACCESS_KEY))).toBe(true);
    expect(isDeletion(lastCookie(setCookies, REFRESH_KEY))).toBe(true);
  });
});

describe("POST /auth/refresh", () => {
  it("rejects without CSRF and makes no upstream refresh", async () => {
    const { res, body, setCookies } = await run({
      path: "/auth/refresh",
      cookies: { [REFRESH_KEY]: makeRefresh() },
    });
    expect(res.status).toBe(401);
    expect(body).toBe("CSRF error");
    expect(nonAppDataCalls()).toEqual([]);
    expect(setCookies).toEqual([]);
  });

  it("refreshes with the HttpOnly refresh cookie and returns ONLY the access token", async () => {
    const current = makeRefresh({ tag: "current" });
    const { res, body, setCookies } = await run({
      path: "/auth/refresh",
      cookies: { [REFRESH_KEY]: current },
      csrf: true,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    const payload = JSON.parse(body);
    expect(Object.keys(payload).sort()).toEqual(["access", "access_expires_at"]);
    expect(payload.access).toBe(upstream.issued.refreshedAccess);
    // Date#toString(), not ISO 8601
    expect(payload.access_expires_at).toMatch(/^\w{3} \w{3} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT/);

    expect(body).not.toContain(upstream.issued.refreshedRefresh);
    expect(body).not.toContain(current);

    const call = upstream.callsTo("/tokens/refresh", "POST")[0];
    expect(call.headers.get("x-refresh-token")).toBe(current);

    expect(lastCookie(setCookies, REFRESH_KEY)!.value).toBe(upstream.issued.refreshedRefresh);
    expect(lastCookie(setCookies, REFRESH_KEY)!.httpOnly).toBe(true);
    expect(lastCookie(setCookies, ACCESS_KEY)!.value).toBe(upstream.issued.refreshedAccess);
    expect(lastCookie(setCookies, ACCESS_KEY)!.httpOnly).toBeUndefined();
  });

  it("with only an access cookie, rotates it via rotate_access (secret key) instead", async () => {
    const access = makeAccess({ tag: "only-access" });
    const { res, body } = await run({
      path: "/auth/refresh",
      cookies: { [ACCESS_KEY]: access },
      csrf: true,
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(body).access).toBe(upstream.issued.rotateAccess);
    expect(upstream.callsTo("/tokens/rotate_access")[0].headers.get("x-authorization")).toBe(access);
  });

  // Known limitation, tracked separately: with no session the refresh
  // endpoint answers 200 {"access":null} rather than 401.
  it("answers 200 with access:null when there is no session", async () => {
    const { res, body } = await run({ path: "/auth/refresh", csrf: true });
    expect(res.status).toBe(200);
    expect(body).toBe('{"access":null}');
    expect(nonAppDataCalls()).toEqual([]);
  });

  it("on upstream rejection: 401, empty body, no token leak, cookies cleared (namespaced + legacy)", async () => {
    const dead = makeRefresh({ tag: "dead" });
    upstream.on("POST", `/v1/auth/${APP_ID}/tokens/refresh`, () =>
      json({ error: "revoked", token: dead, echoed: "sensitive-upstream-detail" }, 401)
    );
    const { res, body, setCookies } = await run({
      path: "/auth/refresh",
      cookies: { [REFRESH_KEY]: dead, [ACCESS_KEY]: makeAccess({ expIn: -10 }) },
      csrf: true,
    });
    expect(res.status).toBe(401);
    expect(body).toBe("");
    // CURRENT BEHAVIOR: declares JSON but sends no body
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(body).not.toContain("sensitive-upstream-detail");
    for (const name of [ACCESS_KEY, REFRESH_KEY, LEGACY_ACCESS_KEY, LEGACY_REFRESH_KEY]) {
      expect(isDeletion(lastCookie(setCookies, name))).toBe(true);
    }
  });

  it("still returns 401 if signOut throws during the failure cleanup", async () => {
    upstream.on("POST", `/v1/auth/${APP_ID}/tokens/refresh`, () => json({}, 401));
    const ctx = makeRouteContext(
      { [CSRF_COOKIE]: CSRF, [REFRESH_KEY]: makeRefresh() },
      { "X-CSRF-Token": CSRF }
    );
    const scute = createRouteHandlerClient({ cookies: ctx.context.cookies }, clientConfig());
    vi.spyOn(scute, "signOut").mockRejectedValue(new Error("network down"));
    const res = await internalHandler(scute, {
      url: new URL("/auth/refresh", ORIGIN),
      method: "POST",
      query: {},
      body: undefined,
      cookies: { [CSRF_COOKIE]: CSRF, [REFRESH_KEY]: "x" },
      headers: new Headers({ "X-CSRF-Token": CSRF }),
    });
    expect(res.status).toBe(401);
  });

  it("does not forward the refresh token in any response header", async () => {
    const { res } = await run({
      path: "/auth/refresh",
      cookies: { [REFRESH_KEY]: makeRefresh() },
      csrf: true,
    });
    res.headers.forEach((value) => {
      expect(value).not.toContain(upstream.issued.refreshedRefresh);
    });
  });
});

describe("POST /auth/sign-out", () => {
  it("rejects without CSRF, keeps cookies, does not revoke upstream", async () => {
    const { res, body, setCookies, responseSetCookies } = await run({
      path: "/auth/sign-out",
      cookies: { [ACCESS_KEY]: makeAccess(), [REFRESH_KEY]: makeRefresh() },
    });
    expect(res.status).toBe(401);
    expect(body).toBe("CSRF error");
    expect(setCookies).toEqual([]);
    expect(responseSetCookies).toEqual([]);
    expect(upstream.callsTo("/current_user", "DELETE")).toEqual([]);
  });

  it("clears CSRF + session cookies (namespaced and legacy) and revokes upstream", async () => {
    const access = makeAccess({ tag: "live" });
    const { res, body, setCookies, responseSetCookies } = await run({
      path: "/auth/sign-out",
      cookies: { [ACCESS_KEY]: access, [REFRESH_KEY]: makeRefresh() },
      csrf: true,
    });
    expect(res.status).toBe(200);
    expect(body).toBe("");
    expect(responseSetCookies).toEqual([
      `${CSRF_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
      `${LEGACY_CSRF_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
    ]);
    for (const name of [ACCESS_KEY, REFRESH_KEY, LEGACY_ACCESS_KEY, LEGACY_REFRESH_KEY]) {
      expect(isDeletion(lastCookie(setCookies, name))).toBe(true);
    }
    const del = upstream.callsTo("/current_user", "DELETE");
    expect(del).toHaveLength(1);
    expect(del[0].headers.get("x-authorization")).toBe(access);
  });

  it("with no session: 200, cookies cleared, nothing revoked upstream", async () => {
    const { res } = await run({ path: "/auth/sign-out", csrf: true });
    expect(res.status).toBe(200);
    expect(upstream.callsTo("/current_user", "DELETE")).toEqual([]);
  });

  it("with an expired access cookie, refreshes first and then revokes the refreshed token", async () => {
    const { res } = await run({
      path: "/auth/sign-out",
      cookies: { [ACCESS_KEY]: makeAccess({ expIn: -60 }), [REFRESH_KEY]: makeRefresh() },
      csrf: true,
    });
    expect(res.status).toBe(200);
    const paths = upstream.calls.map((c) => `${c.method} ${c.path}`);
    expect(paths).toEqual([
      `GET /v1/apps/${APP_ID}`,
      `POST /v1/auth/${APP_ID}/tokens/refresh`,
      `DELETE /v1/auth/${APP_ID}/current_user`,
    ]);
    expect(upstream.callsTo("/current_user", "DELETE")[0].headers.get("x-authorization")).toBe(
      upstream.issued.refreshedAccess
    );
  });

  // The local sign-out always completes; a failed upstream revocation is
  // awaited and handled, not left as an unhandled rejection.
  it("still signs out locally (200, cookies cleared) when upstream revocation fails", async () => {
    upstream.on("DELETE", `/v1/auth/${APP_ID}/current_user`, () => json({ error: "x" }, 500));
    const { result, reasons } = await captureUnhandledRejections(() =>
      run({
        path: "/auth/sign-out",
        cookies: { [ACCESS_KEY]: makeAccess() },
        csrf: true,
      })
    );
    expect(result.res.status).toBe(200);
    expect(isDeletion(lastCookie(result.setCookies, ACCESS_KEY))).toBe(true);
    expect(reasons).toHaveLength(0);
    expect(upstream.callsTo("/current_user", "DELETE").length).toBeGreaterThan(0);
  });
});
