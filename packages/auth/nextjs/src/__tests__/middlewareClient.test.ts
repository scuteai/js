import { NextResponse } from "next/server";
import { createMiddlewareClient } from "../middlewareClient";
import {
  ACCESS_KEY,
  REFRESH_KEY,
  clientConfig,
  createUpstream,
  lastCookie,
  makeAccess,
  makeNextRequest,
  makeRefresh,
  parseCookies,
  settle,
  type Upstream,
} from "./_support";

let upstream: Upstream;

beforeEach(() => {
  upstream = createUpstream().install();
});

afterEach(async () => {
  await settle();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const create = (cookies: Record<string, string> = {}, res = NextResponse.next()) => {
  const req = makeNextRequest("/dashboard", { cookies, headers: { "x-app": "1" } });
  const client: any = createMiddlewareClient({ req, res }, clientConfig());
  return { req, res, client, storage: client.scuteStorage };
};

const OVERRIDE = "x-middleware-override-headers";
const REQUEST = "x-middleware-request-";

/** Request-override keys Next reads from a middleware response. */
const overrideKeys = (res: Response) =>
  (res.headers.get(OVERRIDE) ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => !!k);

/**
 * Headers the browser receives from a middleware response: Next consumes
 * x-middleware-override-headers and every x-middleware-request-<key> it
 * lists, and strips them (next/dist/server/lib/router-utils/resolve-routes).
 */
const browserHeaders = (res: Response) => {
  const keys = overrideKeys(res);
  const out: [string, string][] = [];
  res.headers.forEach((v, k) => {
    if (k === OVERRIDE) return;
    if (k.startsWith(REQUEST) && keys.indexOf(k.slice(REQUEST.length)) !== -1) return;
    out.push([k, v]);
  });
  return out;
};

/** The cookie header the downstream render sees, as name -> value. */
const downstreamCookies = (res: Response) =>
  Object.fromEntries(
    (res.headers.get(REQUEST + "cookie") ?? "")
      .split(";")
      .map((p) => p.trim())
      .filter((p) => !!p)
      .map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)])
  );

describe("createMiddlewareClient storage", () => {
  it("reads from the request Cookie header", async () => {
    const { storage } = create({ a: "1" });
    expect(await storage.getItem("a")).toBe("1");
  });

  it("returns undefined (not null) for a missing cookie", async () => {
    const { storage } = create();
    expect(await storage.getItem("missing")).toBeUndefined();
  });

  it("prefers a value already written to the response Set-Cookie over the request", async () => {
    const { storage, res } = create({ a: "old" });
    res.headers.append("set-cookie", "a=new; Path=/");
    expect(await storage.getItem("a")).toBe("new");
  });

  it("setItem appends a serialized Set-Cookie (cookie@0.5 format) with default Path=/", async () => {
    const { storage, res } = create();
    await storage.setItem("k", "v", { httpOnly: true, sameSite: "lax" });
    expect(res.headers.getSetCookie()).toEqual(["k=v; Path=/; HttpOnly; SameSite=Lax"]);
  });

  it("never writes a response `cookie` header", async () => {
    const { storage, res } = create();
    await storage.setItem("k", "secret-value", { httpOnly: true });
    await storage.removeItem("k");
    expect(res.headers.get("cookie")).toBeNull();
  });

  it("forwards writes to the downstream request through Next's request-header override", async () => {
    const { storage, res } = create({ a: "1", k: "old" });
    await storage.setItem("k", "new value", { httpOnly: true });
    await storage.setItem("b", "2");
    // every original request header stays listed, so Next keeps them
    expect(overrideKeys(res)).toEqual(expect.arrayContaining(["cookie", "x-app"]));
    expect(res.headers.get(REQUEST + "x-app")).toBe("1");
    expect(downstreamCookies(res)).toEqual({ a: "1", k: "new%20value", b: "2" });
  });

  it("removes deleted cookies from the downstream request", async () => {
    const { storage, res } = create({ a: "1", k: "stale" });
    await storage.removeItem("k");
    expect(downstreamCookies(res)).toEqual({ a: "1" });
  });

  it("extends an override already set with NextResponse.next({ request: { headers } })", async () => {
    const headers = new Headers({ "x-custom": "yes", cookie: "a=1" });
    const { storage, res } = create({ a: "1" }, NextResponse.next({ request: { headers } }));
    await storage.setItem("k", "v");
    expect(overrideKeys(res).sort()).toEqual(["cookie", "x-custom"]);
    expect(res.headers.get(REQUEST + "x-custom")).toBe("yes");
    expect(res.headers.get(REQUEST + "x-app")).toBeNull();
    expect(downstreamCookies(res)).toEqual({ a: "1", k: "v" });
  });

  // Known limitation, tracked separately: reads return the first non-empty
  // Set-Cookie match, so a second write in the same run is not read back.
  it("a second write for the same name is not visible to reads (first match wins)", async () => {
    const { storage, res } = create();
    await storage.setItem("k", "v1");
    await storage.setItem("k", "v2");
    expect(res.headers.getSetCookie()).toEqual(["k=v1; Path=/", "k=v2; Path=/"]);
    expect(await storage.getItem("k")).toBe("v1");
  });

  // Known limitation, tracked separately: after a deletion, reads fall back
  // to the request cookie for the rest of the middleware run.
  it("a deleted cookie is still read back from the request", async () => {
    const { storage, res } = create({ k: "stale" });
    await storage.removeItem("k");
    expect(res.headers.getSetCookie()).toEqual(["k=; Max-Age=0; Path=/"]);
    expect(await storage.getItem("k")).toBe("stale");
  });

  it("does nothing (and does not throw) when res has no headers", async () => {
    const req = makeNextRequest("/");
    const client: any = createMiddlewareClient({ req, res: {} as any }, clientConfig());
    await expect(client.scuteStorage.setItem("k", "v")).resolves.toBeUndefined();
    await expect(client.scuteStorage.removeItem("k")).resolves.toBeUndefined();
  });

  it("never touches the request Cookie header", async () => {
    const { storage, req } = create({ a: "1" });
    await storage.setItem("b", "2");
    await storage.removeItem("a");
    expect(req.headers.get("cookie")).toBe("a=1");
  });
});

describe("createMiddlewareClient refresh in middleware", () => {
  it("getSession() with an expired access token refreshes and appends new cookies to the response", async () => {
    const refresh = makeRefresh({ tag: "mw" });
    const { client, res } = create({ [ACCESS_KEY]: makeAccess({ expIn: -60 }), [REFRESH_KEY]: refresh });
    const { data, error } = await client.getSession();
    expect(error).toBeNull();
    expect(data.session.access).toBe(upstream.issued.refreshedAccess);
    expect(upstream.callsTo("/tokens/refresh")[0].headers.get("x-refresh-token")).toBe(refresh);

    const sc = res.headers.getSetCookie();
    expect(lastCookie(sc, ACCESS_KEY)!.value).toBe(upstream.issued.refreshedAccess);
    const r = lastCookie(sc, REFRESH_KEY)!;
    expect(r.value).toBe(upstream.issued.refreshedRefresh);
    expect(r.httpOnly).toBe(true);
  });

  it("no header the browser receives, other than Set-Cookie, contains the refresh token", async () => {
    const { client, res } = create({ [ACCESS_KEY]: makeAccess({ expIn: -60 }), [REFRESH_KEY]: makeRefresh() });
    await client.getSession();
    expect(lastCookie(res.headers.getSetCookie(), REFRESH_KEY)!.value).toBe(upstream.issued.refreshedRefresh);
    const visible = browserHeaders(res).filter(([k]) => k !== "set-cookie");
    expect(visible.length).toBeGreaterThan(0);
    for (const [, v] of visible) expect(v).not.toContain(upstream.issued.refreshedRefresh);
    // every request-override header is listed, so Next strips all of them
    for (const [k] of browserHeaders(res)) expect(k.startsWith("x-middleware-request-")).toBe(false);
  });

  it("forwards refreshed cookies to the downstream request (server components see the new access token)", async () => {
    const { client, res, req } = create({ a: "1", [ACCESS_KEY]: makeAccess({ expIn: -60 }), [REFRESH_KEY]: makeRefresh() });
    await client.getSession();
    const downstream = downstreamCookies(res);
    expect(downstream[ACCESS_KEY]).toBe(upstream.issued.refreshedAccess);
    expect(downstream[REFRESH_KEY]).toBe(upstream.issued.refreshedRefresh);
    expect(downstream.a).toBe("1");
    expect(overrideKeys(res)).toContain("cookie");
    // the incoming request object itself is not mutated
    expect(req.headers.get("cookie")).not.toContain(upstream.issued.refreshedAccess);
  });

  it("getSession() with a valid access token writes nothing", async () => {
    const { client, res } = create({ [ACCESS_KEY]: makeAccess() });
    await client.getSession();
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(upstream.callsTo("/tokens/")).toEqual([]);
  });

  it("refresh failure expires the session: namespaced + legacy deletions appended", async () => {
    upstream.on("POST", "/v1/auth/app-123/tokens/refresh", () => new Response("{}", { status: 401 }));
    const { client, res } = create({ [ACCESS_KEY]: makeAccess({ expIn: -60 }), [REFRESH_KEY]: makeRefresh() });
    const { data } = await client.getSession();
    expect(data.user).toBeNull();
    const names = parseCookies(res.headers.getSetCookie())
      .filter((c) => c.value === "" && c.maxAge === 0)
      .map((c) => c.name);
    expect(new Set(names)).toEqual(
      new Set([ACCESS_KEY, REFRESH_KEY, "sc-access-token", "sc-refresh-token"])
    );
  });
});
