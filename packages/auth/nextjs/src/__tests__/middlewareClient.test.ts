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

const create = (cookies: Record<string, string> = {}) => {
  const req = makeNextRequest("/dashboard", { cookies });
  const res = NextResponse.next();
  const client: any = createMiddlewareClient({ req, res }, clientConfig());
  return { req, res, client, storage: client.scuteStorage };
};

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

  // CURRENT BEHAVIOR (suspected security bug): every write is ALSO appended
  // to a *response* header named `cookie`, full Set-Cookie string included.
  // `cookie` is not a forbidden response header, so if Next forwards
  // middleware response headers to the browser (NextResponse.next() does),
  // same-origin JS can read HttpOnly values (the refresh token) with
  // fetch(location.href).then(r => r.headers.get("cookie")).
  it("mirrors every write into a response `cookie` header", async () => {
    const { storage, res } = create();
    await storage.setItem("k", "secret-value", { httpOnly: true });
    expect(res.headers.get("cookie")).toBe("k=secret-value; Path=/; HttpOnly");
  });

  // CURRENT BEHAVIOR (suspected bug): writes are appended without
  // de-duplication and reads return the FIRST non-empty match, so a second
  // write in the same middleware run is invisible to later reads.
  it("a second write for the same name is not visible to reads (first match wins)", async () => {
    const { storage, res } = create();
    await storage.setItem("k", "v1");
    await storage.setItem("k", "v2");
    expect(res.headers.getSetCookie()).toEqual(["k=v1; Path=/", "k=v2; Path=/"]);
    expect(await storage.getItem("k")).toBe("v1");
  });

  // CURRENT BEHAVIOR (suspected bug): a deletion writes `k=; Max-Age=0`,
  // the empty value is skipped on read, and the stale request cookie is
  // returned again ("resurrection") for the rest of the middleware run.
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

  // CURRENT BEHAVIOR (suspected security bug, see storage test above): the
  // HttpOnly refresh token ends up in a plain `cookie` response header.
  it("leaks the rotated HttpOnly refresh token into the response `cookie` header", async () => {
    const { client, res } = create({ [ACCESS_KEY]: makeAccess({ expIn: -60 }), [REFRESH_KEY]: makeRefresh() });
    await client.getSession();
    const mirrored = res.headers.get("cookie")!;
    expect(mirrored).toContain(`${REFRESH_KEY}=${upstream.issued.refreshedRefresh}`);
    expect(mirrored).toContain("HttpOnly");
  });

  // CURRENT BEHAVIOR (suspected bug): refreshed tokens are only put on the
  // browser-bound response. Nothing overrides the *request* cookies for
  // the downstream render (no x-middleware-override-headers /
  // x-middleware-request-cookie), so server components in the same request
  // still see the expired access token.
  it("does not forward refreshed cookies to the downstream request", async () => {
    const { client, res, req } = create({ [ACCESS_KEY]: makeAccess({ expIn: -60 }), [REFRESH_KEY]: makeRefresh() });
    await client.getSession();
    expect(res.headers.get("x-middleware-override-headers")).toBeNull();
    expect(res.headers.get("x-middleware-request-cookie")).toBeNull();
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
