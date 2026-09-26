/**
 * ScuteHandler: argument-shape dispatch and end-to-end wiring for the three
 * runtimes (App Router route handler, Pages API on Node, Pages API on Edge).
 */
import { IncomingMessage, ServerResponse } from "http";
import { Socket } from "net";
import { ScuteHandler } from "../handlers";
import {
  ACCESS_KEY,
  APP_ID,
  BASE_URL,
  CSRF_COOKIE,
  LEGACY_CSRF_COOKIE,
  REFRESH_KEY,
  SECRET,
  clientConfig,
  createUpstream,
  isDeletion,
  json,
  lastCookie,
  makeAccess,
  makeNextRequest,
  makeRefresh,
  makeRouteContext,
  settle,
  type Upstream,
} from "../../__tests__/_support";

const CSRF = "d".repeat(128);

let upstream: Upstream;

beforeEach(() => {
  upstream = createUpstream().install();
});

afterEach(async () => {
  await settle();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const stubScuteEnv = () => {
  vi.stubEnv("NEXT_PUBLIC_SCUTE_APP_ID", APP_ID);
  vi.stubEnv("NEXT_PUBLIC_SCUTE_BASE_URL", BASE_URL);
  vi.stubEnv("SCUTE_SECRET", SECRET);
};

/** Real Node ServerResponse (real header semantics) with captured output. */
const makeNodeRes = () => {
  const res = new ServerResponse(new IncomingMessage(new Socket()));
  const chunks: Buffer[] = [];
  let ended = false;
  (res as any).write = (chunk: any) => {
    chunks.push(Buffer.from(chunk));
    return true;
  };
  (res as any).end = () => {
    ended = true;
    return res;
  };
  return {
    res,
    body: () => Buffer.concat(chunks).toString(),
    ended: () => ended,
    setCookies: () => {
      const v = res.getHeader("set-cookie");
      return v === undefined ? [] : Array.isArray(v) ? v.map(String) : [String(v)];
    },
  };
};

const makeNodeReq = (
  path: string,
  init: { method?: string; headers?: Record<string, string>; cookies?: Record<string, string> } = {}
) => {
  const cookies = init.cookies ?? {};
  const cookieStr = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return {
    method: init.method ?? "GET",
    url: path,
    headers: {
      host: "localhost:3000",
      ...(cookieStr ? { cookie: cookieStr } : {}),
      ...Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
    },
    cookies,
    query: {},
    body: undefined,
  } as any;
};

describe("ScuteHandler dispatch", () => {
  it("(context) returns a route handler function", () => {
    const { context } = makeRouteContext();
    const h = ScuteHandler(context as any);
    expect(typeof h).toBe("function");
    expect(upstream.calls).toHaveLength(0);
  });

  it("(context, config) returns a route handler function that uses the config", async () => {
    const { context } = makeRouteContext();
    const h = ScuteHandler(context as any, clientConfig({ appId: "cfg-app" }));
    const res = await h(makeNextRequest("/auth/csrf"));
    expect(res.headers.getSetCookie()[0].startsWith("X-CSRF-Token__cfg-app=")).toBe(true);
  });

  it("(context) without config reads the app id from NEXT_PUBLIC_SCUTE_APP_ID", async () => {
    stubScuteEnv();
    const { context } = makeRouteContext();
    const res = await ScuteHandler(context as any)(makeNextRequest("/auth/csrf"));
    expect(res.headers.getSetCookie()[0].startsWith(`${CSRF_COOKIE}=`)).toBe(true);
    expect(upstream.calls[0].url).toBe(`${BASE_URL}/v1/apps/${APP_ID}`);
  });

  // CURRENT BEHAVIOR (suspected bug, low): an explicit `undefined` config
  // makes the dispatcher read `undefined._write` and throw.
  it("(context, undefined) throws a TypeError", () => {
    const { context } = makeRouteContext();
    expect(() => (ScuteHandler as any)(context, undefined)).toThrow(TypeError);
  });

  it("(NextRequest) runs the edge handler and returns a Promise<Response>", async () => {
    stubScuteEnv();
    const out = ScuteHandler(makeNextRequest("/auth/csrf") as any);
    expect(out).toBeInstanceOf(Promise);
    const res = await out;
    expect(res.status).toBe(200);
  });

  it("(NextRequest, config) runs the edge handler with the config", async () => {
    const res = await ScuteHandler(makeNextRequest("/auth/csrf") as any, clientConfig({ appId: "edge-cfg" }) as any);
    expect(res.headers.getSetCookie()[0].startsWith("X-CSRF-Token__edge-cfg=")).toBe(true);
  });

  it("(NextRequest, NextFetchEvent) runs the edge handler with env config", async () => {
    stubScuteEnv();
    const event = { waitUntil: () => {} };
    const res = await (ScuteHandler as any)(makeNextRequest("/auth/csrf"), event);
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()[0].startsWith(`${CSRF_COOKIE}=`)).toBe(true);
  });

  it("(req, res, config) runs the Node pages handler", async () => {
    const { res, body, ended } = makeNodeRes();
    const out = await (ScuteHandler as any)(makeNodeReq("/api/auth/csrf"), res, clientConfig());
    expect(out).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(body()).toMatch(/^[0-9a-f]{128}$/);
    expect(ended()).toBe(true);
  });

  it("(req, res) runs the Node pages handler when res has _write", async () => {
    stubScuteEnv();
    const { res, body } = makeNodeRes();
    (res as any)._write = () => {};
    await (ScuteHandler as any)(makeNodeReq("/api/auth/csrf"), res);
    expect(res.statusCode).toBe(200);
    expect(body()).toMatch(/^[0-9a-f]{128}$/);
  });

  // CURRENT BEHAVIOR (suspected bug, high for Pages Router users): the
  // 2-arg Node overload detects `res` via `res._write`, which a real Node
  // http.ServerResponse does not have. `res` is therefore popped as the
  // *config*, and since a NextApiRequest has no `nextUrl` the call returns
  // the App Router closure instead of handling the request: nothing is
  // written and the API route never responds.
  it("(req, realServerResponse) is mis-dispatched: returns a function and never responds", () => {
    stubScuteEnv();
    const { res, ended } = makeNodeRes();
    expect(typeof (ServerResponse.prototype as any)._write).toBe("undefined");
    const out = (ScuteHandler as any)(makeNodeReq("/api/auth/csrf"), res);
    expect(typeof out).toBe("function");
    expect(ended()).toBe(false);
    expect(upstream.calls).toHaveLength(0);
  });
});

describe("App Router route handler", () => {
  const route = (
    cookies: Record<string, string>,
    headers: Record<string, string>,
    opts: { asyncCookies?: boolean } = {}
  ) => {
    const ctx = makeRouteContext(cookies, headers, opts);
    return { ctx, handler: ScuteHandler(ctx.context as any, clientConfig()) };
  };

  it("sign-in: session cookies go through cookies().set, response carries none", async () => {
    const access = makeAccess();
    const headers = { Authorization: `Bearer ${access}`, "X-CSRF-Token": CSRF };
    const { ctx, handler } = route({ [CSRF_COOKIE]: CSRF }, headers);
    const res = await handler(
      makeNextRequest("/auth/sign-in", { method: "POST", headers, cookies: { [CSRF_COOKIE]: CSRF } })
    );
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(lastCookie(ctx.setCookies(), REFRESH_KEY)!.value).toBe(upstream.issued.rotateRefresh);
    expect(lastCookie(ctx.setCookies(), REFRESH_KEY)!.httpOnly).toBe(true);
    expect(lastCookie(ctx.setCookies(), ACCESS_KEY)!.value).toBe(upstream.issued.rotateAccess);
  });

  it("supports async cookies() (Next 15+)", async () => {
    const headers = { "X-CSRF-Token": CSRF };
    const { ctx, handler } = route({ [CSRF_COOKIE]: CSRF, [REFRESH_KEY]: makeRefresh() }, headers, {
      asyncCookies: true,
    });
    const res = await handler(makeNextRequest("/auth/refresh", { method: "POST", headers }));
    expect(res.status).toBe(200);
    expect(lastCookie(ctx.setCookies(), REFRESH_KEY)!.value).toBe(upstream.issued.refreshedRefresh);
  });

  // CURRENT BEHAVIOR: CSRF header and Authorization are read from
  // context.headers(), cookies from context.cookies(); the NextRequest's own
  // headers/cookies are ignored for auth decisions.
  it("reads the CSRF header from context.headers(), not from the request", async () => {
    const { handler } = route({ [CSRF_COOKIE]: CSRF }, {});
    const res = await handler(
      makeNextRequest("/auth/sign-out", {
        method: "POST",
        headers: { "X-CSRF-Token": CSRF },
        cookies: { [CSRF_COOKIE]: CSRF },
      })
    );
    expect(res.status).toBe(401);
  });

  it("reads the CSRF cookie from context.cookies(), not from the request", async () => {
    const { handler } = route({}, { "X-CSRF-Token": CSRF });
    const res = await handler(
      makeNextRequest("/auth/sign-out", {
        method: "POST",
        headers: { "X-CSRF-Token": CSRF },
        cookies: { [CSRF_COOKIE]: CSRF },
      })
    );
    expect(res.status).toBe(401);
  });

  it("uses the request URL and method for routing", async () => {
    const { handler } = route({}, {});
    expect((await handler(makeNextRequest("/auth/csrf", { method: "POST" }))).status).toBe(400);
    expect((await handler(makeNextRequest("/auth/csrf"))).status).toBe(200);
  });

  it("consumes a JSON body without affecting the result", async () => {
    const { handler } = route({}, {});
    const res = await handler(
      makeNextRequest("/auth/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refresh: "attacker-supplied" }),
      })
    );
    expect(res.status).toBe(401);
    expect(upstream.callsTo("/tokens/refresh")).toEqual([]);
  });
});

describe("Pages API (Node)", () => {
  it("csrf: copies status, every Set-Cookie, the cookie header and the body onto res", async () => {
    const { res, body, setCookies } = makeNodeRes();
    await (ScuteHandler as any)(makeNodeReq("/api/auth/csrf"), res, clientConfig());
    const token = body();
    expect(res.statusCode).toBe(200);
    expect(setCookies()).toEqual([
      `${CSRF_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax`,
      `${LEGACY_CSRF_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
    ]);
    expect(res.getHeader("cookie")).toBe(`${CSRF_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax`);
    expect(res.getHeader("content-type")).toBe("text/plain;charset=UTF-8");
  });

  it("sign-in: session cookies are written to res via setHeader (refresh HttpOnly), body empty", async () => {
    const { res, body, setCookies } = makeNodeRes();
    const req = makeNodeReq("/api/auth/sign-in", {
      method: "POST",
      headers: { Authorization: `Bearer ${makeAccess()}`, "X-CSRF-Token": CSRF },
      cookies: { [CSRF_COOKIE]: CSRF },
    });
    await (ScuteHandler as any)(req, res, clientConfig());
    expect(res.statusCode).toBe(200);
    expect(body()).toBe("");
    const refresh = lastCookie(setCookies(), REFRESH_KEY)!;
    expect(refresh.value).toBe(upstream.issued.rotateRefresh);
    expect(refresh.httpOnly).toBe(true);
    const access = lastCookie(setCookies(), ACCESS_KEY)!;
    expect(access.value).toBe(upstream.issued.rotateAccess);
    expect(access.httpOnly).toBeUndefined();
    // de-duplicated: exactly one Set-Cookie per session cookie name
    expect(setCookies().filter((c) => c.startsWith(`${ACCESS_KEY}=`))).toHaveLength(1);
    expect(setCookies().filter((c) => c.startsWith(`${REFRESH_KEY}=`))).toHaveLength(1);
  });

  it("uses the Next init URL meta when present for routing", async () => {
    const { res } = makeNodeRes();
    const req = makeNodeReq("/ignored");
    req[Symbol("NextInternalRequestMeta")] = { __NEXT_INIT_URL: "http://localhost:3000/api/auth/csrf" };
    await (ScuteHandler as any)(req, res, clientConfig());
    expect(res.statusCode).toBe(200);
  });

  it("HEAD: writes status but no body", async () => {
    const { res, body, ended } = makeNodeRes();
    await (ScuteHandler as any)(makeNodeReq("/api/auth/csrf", { method: "HEAD" }), res, clientConfig());
    expect(res.statusCode).toBe(400);
    expect(body()).toBe("");
    expect(ended()).toBe(true);
  });

  it("defaults a missing method to GET", async () => {
    const { res } = makeNodeRes();
    const req = makeNodeReq("/api/auth/csrf");
    delete req.method;
    await (ScuteHandler as any)(req, res, clientConfig());
    expect(res.statusCode).toBe(200);
  });

  // CURRENT BEHAVIOR (suspected bug): on the Pages Node adapter a deleted
  // cookie "resurrects" from req.cookies (see pagesServerClient tests), so
  // a dead refresh token is sent upstream twice per refresh attempt (once
  // by refreshSession, again by the signOut cleanup). App Router sends it
  // once.
  it("refresh failure: dead refresh token is sent upstream twice, cookies still end up cleared", async () => {
    upstream.on("POST", `/v1/auth/${APP_ID}/tokens/refresh`, () => json({ error: "revoked" }, 401));
    const dead = makeRefresh({ tag: "dead" });
    const { res, body, setCookies } = makeNodeRes();
    const req = makeNodeReq("/api/auth/refresh", {
      method: "POST",
      headers: { "X-CSRF-Token": CSRF },
      cookies: { [CSRF_COOKIE]: CSRF, [REFRESH_KEY]: dead, [ACCESS_KEY]: makeAccess({ expIn: -30 }) },
    });
    await (ScuteHandler as any)(req, res, clientConfig());
    await settle();
    expect(res.statusCode).toBe(401);
    expect(body()).toBe("");
    const refreshCalls = upstream.callsTo("/tokens/refresh", "POST");
    expect(refreshCalls).toHaveLength(2);
    for (const c of refreshCalls) expect(c.headers.get("x-refresh-token")).toBe(dead);
    expect(isDeletion(lastCookie(setCookies(), REFRESH_KEY))).toBe(true);
    expect(isDeletion(lastCookie(setCookies(), ACCESS_KEY))).toBe(true);
  });
});

describe("Pages API (Edge)", () => {
  it("csrf: the token cookie is set on the returned Response", async () => {
    const res = await ScuteHandler(makeNextRequest("/api/auth/csrf") as any, clientConfig() as any);
    const token = await res.text();
    expect(res.headers.getSetCookie()[0]).toBe(`${CSRF_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax`);
  });

  // CURRENT BEHAVIOR (suspected bug, high for Edge Pages users): the edge
  // storage adapter writes session cookies onto the *request* cookie jar
  // (NextRequest.cookies.set), never onto the Response. Sign-in answers 200
  // but the browser receives no session cookies at all.
  it("sign-in: answers 200 but sends no session Set-Cookie to the browser", async () => {
    const headers = { Authorization: `Bearer ${makeAccess()}`, "X-CSRF-Token": CSRF };
    const req = makeNextRequest("/api/auth/sign-in", {
      method: "POST",
      headers,
      cookies: { [CSRF_COOKIE]: CSRF },
    });
    const res = await ScuteHandler(req as any, clientConfig() as any);
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toEqual([]);
    // ...the tokens only live on the incoming request object
    expect(req.cookies.get(REFRESH_KEY)?.value).toBe(upstream.issued.rotateRefresh);
    expect(req.headers.get("cookie")).toContain(`${REFRESH_KEY}=`);
  });

  it("refresh: returns the new access token but never persists the rotated refresh token", async () => {
    const old = makeRefresh({ tag: "old" });
    const headers = { "X-CSRF-Token": CSRF };
    const req = makeNextRequest("/api/auth/refresh", {
      method: "POST",
      headers,
      cookies: { [CSRF_COOKIE]: CSRF, [REFRESH_KEY]: old },
    });
    const res = await ScuteHandler(req as any, clientConfig() as any);
    expect(res.status).toBe(200);
    expect(JSON.parse(await res.text()).access).toBe(upstream.issued.refreshedAccess);
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});
