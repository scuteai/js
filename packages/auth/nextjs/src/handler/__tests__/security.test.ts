/**
 * Security-focused characterization of the Next.js auth handler, driven
 * end to end through ScuteHandler (App Router unless noted).
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
  json,
  lastCookie,
  makeAccess,
  makeNextRequest,
  makeRefresh,
  makeRouteContext,
  parseCookies,
  settle,
  captureUnhandledRejections,
  type Upstream,
} from "../../__tests__/_support";

const CSRF = "e".repeat(128);
const EVIL = "https://evil.example";

let upstream: Upstream;

beforeEach(() => {
  upstream = createUpstream().install();
});

afterEach(async () => {
  await settle();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

type Call = {
  path: string;
  method?: string;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
};

/** App Router call where request headers/cookies are mirrored into the context, like Next does. */
const call = async ({ path, method = "POST", cookies = {}, headers = {}, body }: Call) => {
  const ctx = makeRouteContext(cookies, headers);
  const handler = ScuteHandler(ctx.context as any, clientConfig());
  const res = await handler(makeNextRequest(path, { method, headers, cookies, body }));
  await settle();
  const text = await res.text();
  const respHeaders: [string, string][] = [];
  res.headers.forEach((v, k) => respHeaders.push([k, v]));
  return {
    res,
    text,
    respHeaders,
    setCookies: ctx.setCookies(),
    history: ctx.cookieHistory(),
    responseSetCookies: res.headers.getSetCookie(),
  };
};

const withCsrf = (c: Call): Call => ({
  ...c,
  cookies: { [CSRF_COOKIE]: CSRF, ...(c.cookies ?? {}) },
  headers: { "X-CSRF-Token": CSRF, ...(c.headers ?? {}) },
});

const STATE_CHANGING = ["/auth/sign-in", "/auth/sign-out", "/auth/refresh"];
const tokenCalls = () =>
  upstream.calls.filter((c) => /tokens\/|current_user/.test(c.path));

describe("CSRF enforcement on state-changing endpoints", () => {
  it.each(STATE_CHANGING)("%s: cookie without header -> 401", async (path) => {
    const r = await call({
      path,
      cookies: { [CSRF_COOKIE]: CSRF, [REFRESH_KEY]: makeRefresh(), [ACCESS_KEY]: makeAccess() },
      headers: { Authorization: `Bearer ${makeAccess()}` },
    });
    expect(r.res.status).toBe(401);
    expect(r.text).toBe("CSRF error");
    expect(tokenCalls()).toEqual([]);
    expect(r.setCookies).toEqual([]);
  });

  it.each(STATE_CHANGING)("%s: header without cookie -> 401", async (path) => {
    const r = await call({ path, headers: { "X-CSRF-Token": CSRF }, cookies: { [REFRESH_KEY]: makeRefresh() } });
    expect(r.res.status).toBe(401);
    expect(tokenCalls()).toEqual([]);
  });

  it.each(STATE_CHANGING)("%s: mismatched header/cookie -> 401", async (path) => {
    const r = await call({
      path,
      headers: { "X-CSRF-Token": "f".repeat(128) },
      cookies: { [CSRF_COOKIE]: CSRF, [REFRESH_KEY]: makeRefresh() },
    });
    expect(r.res.status).toBe(401);
    expect(tokenCalls()).toEqual([]);
  });

  it("a classic cross-site form POST (token in urlencoded body, no header) is rejected", async () => {
    const r = await call({
      path: "/auth/sign-out",
      cookies: { [CSRF_COOKIE]: CSRF, [ACCESS_KEY]: makeAccess() },
      headers: { "content-type": "application/x-www-form-urlencoded", Origin: EVIL },
      body: `X-CSRF-Token=${CSRF}`,
    });
    expect(r.res.status).toBe(401);
    expect(upstream.callsTo("/current_user", "DELETE")).toEqual([]);
  });

  it("a token in the query string is not accepted", async () => {
    const r = await call({
      path: `/auth/sign-out?X-CSRF-Token=${CSRF}`,
      cookies: { [CSRF_COOKIE]: CSRF, [ACCESS_KEY]: makeAccess() },
    });
    expect(r.res.status).toBe(401);
  });

  it.each(STATE_CHANGING)("%s via GET is not routed (400), so <img>/link CSRF cannot trigger it", async (path) => {
    const r = await call({ ...withCsrf({ path, cookies: { [ACCESS_KEY]: makeAccess() } }), method: "GET" });
    expect(r.res.status).toBe(400);
    expect(tokenCalls()).toEqual([]);
  });

  // Known limitation, tracked separately: there is no Origin / Referer
  // check; CSRF protection is the X-CSRF-Token header plus the HttpOnly
  // SameSite=Lax double-submit cookie.
  it("accepts a valid double-submit even with a cross-origin Origin and Referer", async () => {
    const r = await call(
      withCsrf({
        path: "/auth/sign-out",
        cookies: { [ACCESS_KEY]: makeAccess() },
        headers: { Origin: EVIL, Referer: `${EVIL}/attack`, "Sec-Fetch-Site": "cross-site" },
      })
    );
    expect(r.res.status).toBe(200);
    expect(upstream.callsTo("/current_user", "DELETE")).toHaveLength(1);
  });

  it("accepts a valid double-submit with no Origin or Referer at all", async () => {
    const r = await call(withCsrf({ path: "/auth/refresh", cookies: { [REFRESH_KEY]: makeRefresh() } }));
    expect(r.res.status).toBe(200);
  });

  // Known limitation, tracked separately (REF-41): the legacy unsuffixed
  // `X-CSRF-Token` cookie is still accepted for this app.
  it("accepts a planted legacy X-CSRF-Token cookie as the CSRF secret", async () => {
    const r = await call({
      path: "/auth/sign-out",
      cookies: { [LEGACY_CSRF_COOKIE]: "attacker-known", [ACCESS_KEY]: makeAccess() },
      headers: { "X-CSRF-Token": "attacker-known" },
    });
    expect(r.res.status).toBe(200);
  });

  it("another app's namespaced CSRF cookie is not accepted", async () => {
    const r = await call({
      path: "/auth/sign-out",
      cookies: { "X-CSRF-Token__app-999": CSRF, [ACCESS_KEY]: makeAccess() },
      headers: { "X-CSRF-Token": CSRF },
    });
    expect(r.res.status).toBe(401);
  });

  it("emits no CORS headers on any response, and OPTIONS preflights are refused (400)", async () => {
    for (const [method, path] of [
      ["GET", "/auth/csrf"],
      ["OPTIONS", "/auth/sign-in"],
      ["OPTIONS", "/auth/refresh"],
      ["POST", "/auth/refresh"],
    ]) {
      const r = await call(
        withCsrf({
          path,
          method,
          headers: { Origin: EVIL, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-csrf-token" },
        })
      );
      if (method === "OPTIONS") expect(r.res.status).toBe(400);
      for (const [k] of r.respHeaders) expect(k.startsWith("access-control-")).toBe(false);
    }
  });

  it("the CSRF cookie itself is HttpOnly + SameSite=Lax + Path=/", async () => {
    const r = await call({ path: "/auth/csrf", method: "GET" });
    const c = parseCookies(r.responseSetCookies).find((x) => x.name === CSRF_COOKIE)!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe("Lax");
    expect(c.path).toBe("/");
  });
});

describe("refresh token confidentiality", () => {
  const allResponseText = (r: Awaited<ReturnType<typeof call>>) =>
    [r.text, ...r.respHeaders.map(([k, v]) => `${k}: ${v}`)].join("\n");

  it("sign-in: the refresh token only appears in an HttpOnly cookie", async () => {
    const r = await call(withCsrf({ path: "/auth/sign-in", headers: { Authorization: `Bearer ${makeAccess()}` } }));
    expect(r.res.status).toBe(200);
    const rt = upstream.issued.rotateRefresh;
    expect(allResponseText(r)).not.toContain(rt);
    for (const c of parseCookies(r.history)) {
      if (c.value.includes(rt)) {
        expect(c.name).toBe(REFRESH_KEY);
        expect(c.httpOnly).toBe(true);
      }
    }
  });

  it("refresh: the rotated refresh token only appears in an HttpOnly cookie", async () => {
    const r = await call(withCsrf({ path: "/auth/refresh", cookies: { [REFRESH_KEY]: makeRefresh() } }));
    const rt = upstream.issued.refreshedRefresh;
    expect(r.res.status).toBe(200);
    expect(allResponseText(r)).not.toContain(rt);
    const withToken = parseCookies(r.history).filter((c) => c.value.includes(rt));
    expect(withToken.length).toBeGreaterThan(0);
    for (const c of withToken) {
      expect(c.name).toBe(REFRESH_KEY);
      expect(c.httpOnly).toBe(true);
    }
  });

  // By design: the access token cookie is not HttpOnly so the browser SDK
  // can read it. Sign-in only exchanges access tokens issued in the last
  // 30s (see internalHandler tests).
  it("the access token cookie is readable by JS (not HttpOnly)", async () => {
    const r = await call(withCsrf({ path: "/auth/sign-in", headers: { Authorization: `Bearer ${makeAccess()}` } }));
    const a = lastCookie(r.setCookies, ACCESS_KEY)!;
    expect(a.value).toBe(upstream.issued.rotateAccess);
    expect(a.httpOnly).toBeUndefined();
  });

  it("a refresh token smuggled in a JSON body is ignored", async () => {
    const r = await call(
      withCsrf({
        path: "/auth/refresh",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refresh: makeRefresh({ tag: "smuggled" }) }),
      })
    );
    expect(r.text).toBe('{"access":null}');
    expect(upstream.callsTo("/tokens/refresh")).toEqual([]);
  });

  describe("no response header other than Set-Cookie ever contains the refresh token", () => {
    const leaks = (headers: Headers | Record<string, unknown>, token: string) => {
      const entries: [string, string][] = [];
      if (headers instanceof Headers) headers.forEach((v, k) => entries.push([k, v]));
      else for (const [k, v] of Object.entries(headers)) entries.push([k, String(v)]);
      return entries.filter(([k, v]) => k.toLowerCase() !== "set-cookie" && v.includes(token)).map(([k]) => k);
    };

    const nodeCall = async (path: string, headers: Record<string, string>, cookies: Record<string, string>) => {
      const res = new ServerResponse(new IncomingMessage(new Socket()));
      (res as any).write = () => true;
      (res as any).end = () => res;
      await (ScuteHandler as any)(
        { method: "POST", url: path, headers: { host: "localhost", ...headers }, cookies, query: {} },
        res,
        clientConfig()
      );
      return res;
    };

    it("App Router sign-in and refresh", async () => {
      const signIn = await call(withCsrf({ path: "/auth/sign-in", headers: { Authorization: `Bearer ${makeAccess()}` } }));
      expect(signIn.res.status).toBe(200);
      expect(leaks(signIn.res.headers, upstream.issued.rotateRefresh)).toEqual([]);
      const refresh = await call(withCsrf({ path: "/auth/refresh", cookies: { [REFRESH_KEY]: makeRefresh() } }));
      expect(refresh.res.status).toBe(200);
      expect(leaks(refresh.res.headers, upstream.issued.refreshedRefresh)).toEqual([]);
    });

    it("Pages Node sign-in and refresh", async () => {
      const signIn = await nodeCall(
        "/api/auth/sign-in",
        { authorization: `Bearer ${makeAccess()}`, "x-csrf-token": CSRF },
        { [CSRF_COOKIE]: CSRF }
      );
      expect(signIn.statusCode).toBe(200);
      expect(leaks(signIn.getHeaders(), upstream.issued.rotateRefresh)).toEqual([]);
      const refresh = await nodeCall(
        "/api/auth/refresh",
        { "x-csrf-token": CSRF },
        { [CSRF_COOKIE]: CSRF, [REFRESH_KEY]: makeRefresh() }
      );
      expect(refresh.statusCode).toBe(200);
      expect(leaks(refresh.getHeaders(), upstream.issued.refreshedRefresh)).toEqual([]);
    });

    it("Pages Edge sign-in and refresh", async () => {
      const signIn = await ScuteHandler(
        makeNextRequest("/api/auth/sign-in", {
          method: "POST",
          headers: { Authorization: `Bearer ${makeAccess()}`, "X-CSRF-Token": CSRF },
          cookies: { [CSRF_COOKIE]: CSRF },
        }) as any,
        clientConfig() as any
      );
      expect(signIn.status).toBe(200);
      expect(leaks(signIn.headers, upstream.issued.rotateRefresh)).toEqual([]);
      const refresh = await ScuteHandler(
        makeNextRequest("/api/auth/refresh", {
          method: "POST",
          headers: { "X-CSRF-Token": CSRF },
          cookies: { [CSRF_COOKIE]: CSRF, [REFRESH_KEY]: makeRefresh() },
        }) as any,
        clientConfig() as any
      );
      expect(refresh.status).toBe(200);
      expect(leaks(refresh.headers, upstream.issued.refreshedRefresh)).toEqual([]);
    });

    it("the CSRF endpoint sets no response `cookie` header", async () => {
      const r = await call({ path: "/auth/csrf", method: "GET" });
      expect(r.res.headers.get("cookie")).toBeNull();
    });
  });

  it("Pages Node sign-in never sets a response `cookie` header with session tokens", async () => {
    const res = new ServerResponse(new IncomingMessage(new Socket()));
    (res as any).write = () => true;
    (res as any).end = () => res;
    await (ScuteHandler as any)(
      {
        method: "POST",
        url: "/api/auth/sign-in",
        headers: { host: "localhost", authorization: `Bearer ${makeAccess()}`, "x-csrf-token": CSRF },
        cookies: { [CSRF_COOKIE]: CSRF },
        query: {},
      },
      res,
      clientConfig()
    );
    expect(res.getHeader("cookie")).toBeUndefined();
    const sc = (res.getHeader("set-cookie") as string[]).join("\n");
    expect(sc).toContain(`${REFRESH_KEY}=${upstream.issued.rotateRefresh}`);
  });
});

describe("upstream error handling does not leak", () => {
  it.each([
    ["/auth/refresh", "POST", `/v1/auth/${APP_ID}/tokens/refresh`, { [REFRESH_KEY]: "__RT__" }, {}],
    ["/auth/sign-in", "POST", `/v1/auth/${APP_ID}/tokens/rotate_access`, {}, { Authorization: "Bearer __AT__" }],
  ])("%s: upstream 4xx/5xx body, headers and tokens are not reflected", async (path, method, upstreamPath, cookies, headers) => {
    const rt = makeRefresh({ tag: "leak" });
    const at = makeAccess({ tag: "leak" });
    const c = Object.fromEntries(Object.entries(cookies).map(([k]) => [k, rt]));
    const h = Object.fromEntries(Object.entries(headers).map(([k]) => [k, `Bearer ${at}`]));
    for (const status of [400, 401, 403, 500]) {
      upstream.on(method, upstreamPath, () => {
        const r = json({ error: "nope", stack: "at Secret.internal (secret.rb:1)", token: rt, access: at }, status);
        r.headers.set("x-upstream-secret", "s3cr3t");
        return r;
      });
      const r = await call(withCsrf({ path, cookies: c, headers: h }));
      expect(r.res.status).toBe(401);
      expect(r.text).toBe("");
      expect(r.res.headers.get("x-upstream-secret")).toBeNull();
      const everything = [r.text, ...r.respHeaders.map(([k, v]) => `${k}: ${v}`)].join("\n");
      for (const secret of ["secret.rb", rt, at, SECRET, "s3cr3t"]) {
        expect(everything).not.toContain(secret);
      }
    }
  });

  it("the secret key never appears in any response, header or cookie", async () => {
    const results = [
      await call({ path: "/auth/csrf", method: "GET" }),
      await call(withCsrf({ path: "/auth/sign-in", headers: { Authorization: `Bearer ${makeAccess()}` } })),
      await call(withCsrf({ path: "/auth/refresh", cookies: { [REFRESH_KEY]: makeRefresh() } })),
      await call(withCsrf({ path: "/auth/sign-out", cookies: { [ACCESS_KEY]: makeAccess() } })),
      await call({ path: "/auth/nope", method: "GET" }),
    ];
    for (const r of results) {
      const everything = [r.text, ...r.respHeaders.flat(), ...r.history].join("\n");
      expect(everything).not.toContain(SECRET);
    }
  });
});

describe("sign-out when upstream rejects the revocation", () => {
  // Known limitation, tracked separately (js-core ScuteBaseHttp.delete):
  // the sign-out revocation request is not awaited, so an upstream 401 on it
  // surfaces as an unhandled promise rejection.
  it("any decodable access cookie + a valid CSRF pair -> sign-out 200 and an unhandled rejection", async () => {
    upstream.on("DELETE", `/v1/auth/${APP_ID}/current_user`, () => json({ error: "invalid token" }, 401));
    const forged = makeAccess({ uuid: "anyone", tag: "forged" });
    const { result, reasons } = await captureUnhandledRejections(() =>
      call(withCsrf({ path: "/auth/sign-out", cookies: { [ACCESS_KEY]: forged } }))
    );
    expect(result.res.status).toBe(200);
    expect(upstream.callsTo("/current_user", "DELETE")[0].headers.get("x-authorization")).toBe(forged);
    expect(reasons).toHaveLength(1);
    expect((reasons[0] as any).status).toBe(401);
  });
});

describe("header / cookie injection", () => {
  it("a CSRF cookie value with CR/LF and attributes is percent-encoded when reflected into Set-Cookie", async () => {
    const r = await call({
      path: "/auth/csrf",
      method: "GET",
      cookies: { [CSRF_COOKIE]: "x\r\nSet-Cookie: pwn=1; Domain=evil.example" },
    });
    expect(r.text).toBe("x\r\nSet-Cookie: pwn=1; Domain=evil.example");
    expect(r.responseSetCookies).toHaveLength(2);
    expect(r.responseSetCookies[0]).toBe(
      `${CSRF_COOKIE}=x%0D%0ASet-Cookie%3A%20pwn%3D1%3B%20Domain%3Devil.example; Path=/; HttpOnly; SameSite=Lax`
    );
    const parsed = parseCookies(r.responseSetCookies);
    expect(parsed.map((c) => c.name)).toEqual([CSRF_COOKIE, LEGACY_CSRF_COOKIE]);
    expect(parsed.every((c) => c.domain === undefined)).toBe(true);
  });

  it("serves the reflected CSRF token as text/plain with nosniff and no-store", async () => {
    const r = await call({ path: "/auth/csrf", method: "GET", cookies: { [CSRF_COOKIE]: "<script>1</script>" } });
    expect(r.text).toBe("<script>1</script>");
    expect(r.res.headers.get("content-type")).toBe("text/plain;charset=UTF-8");
    expect(r.res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.res.headers.get("cache-control")).toBe("no-store");
  });

  it("a bearer token carrying cookie attributes is rejected before it is stored or sent upstream", async () => {
    const forged = `${makeAccess()}; Domain=evil.example; Path=/; HttpOnly`;
    const r = await call(withCsrf({ path: "/auth/sign-in", headers: { Authorization: `Bearer ${forged}` } }));
    expect(r.res.status).toBe(401);
    const written = r.history.filter((c) => c.startsWith(`${ACCESS_KEY}=`) && !c.startsWith(`${ACCESS_KEY}=;`));
    expect(written).toEqual([]);
    for (const c of parseCookies(r.history)) expect(c.domain).toBeUndefined();
    expect(upstream.callsTo("/tokens/")).toEqual([]);
  });
});

describe("path confusion", () => {
  it.each([
    "/auth/sign-out/",
    "/auth/sign-out/.",
    "/auth/sign-out/..",
    "/auth/SIGN-OUT",
    "/auth/sign%2Dout",
    "/auth/sign-out;x=1",
    "/auth/sign-out%00",
    "/auth/sign-out%2F",
    "/auth%2Fsign-out",
  ])("POST %s with valid CSRF is not treated as sign-out", async (path) => {
    const r = await call(withCsrf({ path, cookies: { [ACCESS_KEY]: makeAccess() } }));
    expect(r.res.status).toBe(400);
    expect(upstream.callsTo("/current_user", "DELETE")).toEqual([]);
  });

  it("dot segments are normalized by the URL parser before matching (and CSRF is still enforced)", async () => {
    const noCsrf = await call({ path: "/x/../auth/sign-out", cookies: { [ACCESS_KEY]: makeAccess() } });
    expect(noCsrf.res.status).toBe(401);
    const ok = await call(withCsrf({ path: "/x/../auth/sign-out", cookies: { [ACCESS_KEY]: makeAccess() } }));
    expect(ok.res.status).toBe(200);
  });

  it("any path ending in /auth/<handler> is served, whatever precedes it", async () => {
    const r = await call(withCsrf({ path: "/totally/unrelated/auth/sign-out", cookies: { [ACCESS_KEY]: makeAccess() } }));
    expect(r.res.status).toBe(200);
  });
});

describe("no open redirects", () => {
  it("never emits 3xx or Location, whatever redirect-looking parameters are sent", async () => {
    const qs = `?redirect=${encodeURIComponent(EVIL)}&next=//evil.example&returnTo=${encodeURIComponent(EVIL)}&callbackUrl=${encodeURIComponent(EVIL)}`;
    const cases: Call[] = [
      { path: `/auth/csrf${qs}`, method: "GET" },
      withCsrf({ path: `/auth/sign-in${qs}`, headers: { Authorization: `Bearer ${makeAccess()}` } }),
      withCsrf({ path: `/auth/sign-out${qs}` }),
      withCsrf({ path: `/auth/refresh${qs}`, cookies: { [REFRESH_KEY]: makeRefresh() } }),
      { path: `/auth/unknown${qs}`, method: "GET" },
    ];
    for (const c of cases) {
      const r = await call(c);
      expect(r.res.status >= 300 && r.res.status < 400).toBe(false);
      expect(r.res.headers.get("location")).toBeNull();
      expect(r.res.headers.get("refresh")).toBeNull();
    }
  });
});

describe("no SSRF-style proxying", () => {
  it("never forwards arbitrary paths, methods, query strings, hosts or headers upstream", async () => {
    const attackerHeaders = {
      Host: "internal.service",
      "X-Forwarded-Host": "169.254.169.254",
      "X-Forwarded-For": "10.0.0.1",
      "X-Custom": "should-not-forward",
      Cookie: "ignored=1",
    };
    const paths = [
      "/auth/../../v1/apps/other-app",
      "/auth/proxy?url=http://169.254.169.254/latest/meta-data",
      "/auth/v1/auth/other/tokens/refresh",
      "/auth/http%3A%2F%2Finternal",
    ];
    for (const method of ["GET", "POST", "PUT", "DELETE", "PATCH"]) {
      for (const path of paths) {
        await call({ path, method, headers: attackerHeaders });
      }
    }
    // the only upstream traffic is the per-request app-data GET
    for (const c of upstream.calls) {
      expect(`${c.method} ${c.url}`).toBe(`GET ${BASE_URL}/v1/apps/${APP_ID}`);
    }
  });

  it("the upstream origin is always the configured baseUrl and incoming headers are not forwarded", async () => {
    await call(
      withCsrf({
        path: "/auth/sign-in?x=1",
        headers: {
          Authorization: `Bearer ${makeAccess()}`,
          "X-Forwarded-Host": "169.254.169.254",
          "X-Custom": "should-not-forward",
        },
      })
    );
    await call(withCsrf({ path: "/auth/refresh", cookies: { [REFRESH_KEY]: makeRefresh() } }));
    expect(upstream.calls.length).toBeGreaterThan(2);
    for (const c of upstream.calls) {
      expect(new URL(c.url).origin).toBe(BASE_URL);
      expect(c.url).not.toContain("?x=1");
      expect(c.headers.get("x-custom")).toBeNull();
      expect(c.headers.get("x-forwarded-host")).toBeNull();
      expect(c.headers.get("cookie")).toBeNull();
      expect(c.headers.get("x-csrf-token")).toBeNull();
    }
    // the user's bearer goes up as X-Authorization; Authorization stays the secret key
    const rotate = upstream.callsTo("/tokens/rotate_access")[0];
    expect(rotate.headers.get("authorization")).toBe(`Bearer ${SECRET}`);
  });

  // Known limitation, tracked separately: every request, including unknown
  // paths, constructs a ScuteClient whose constructor GETs /v1/apps/:id.
  it("each unauthenticated request triggers one upstream app-data GET", async () => {
    for (let i = 0; i < 5; i++) await call({ path: `/auth/junk-${i}`, method: "GET" });
    expect(upstream.calls).toHaveLength(5);
    for (const c of upstream.calls) expect(c.headers.get("authorization")).toBe(`Bearer ${SECRET}`);
  });
});
