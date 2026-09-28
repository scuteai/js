/**
 * createClientComponentClient / createPagesBrowserClient.
 *
 * The browser is faked with a minimal `window` + `document.cookie` jar
 * (jsdom is not a dependency of this package). The jar records every raw
 * `document.cookie = ...` write so attributes can be asserted.
 *
 * Every test re-imports the module (vi.resetModules) because the browser
 * client is a module-level singleton.
 */
import {
  ACCESS_KEY,
  APP_ID,
  BASE_URL,
  LEGACY_ACCESS_KEY,
  LEGACY_REFRESH_KEY,
  REFRESH_KEY,
  SECRET,
  createUpstream,
  json,
  makeAccess,
  makeRefresh,
  settle,
  type Upstream,
} from "./_support";

const CSRF = "b".repeat(128);

type Jar = {
  jar: Map<string, string>;
  writes: string[];
};

const installBrowser = (initial: Record<string, string> = {}): Jar => {
  const jar = new Map<string, string>(Object.entries(initial));
  const writes: string[] = [];
  const doc: any = { createElement: () => ({}), visibilityState: "hidden" };
  Object.defineProperty(doc, "cookie", {
    get: () => [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    set: (str: string) => {
      writes.push(str);
      const [pair, ...attrs] = str.split(";").map((s) => s.trim());
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const exp = attrs.find((a) => a.toLowerCase().startsWith("expires="));
      if (exp && new Date(exp.slice("expires=".length)).getTime() <= Date.now()) {
        jar.delete(name);
      } else {
        jar.set(name, value);
      }
    },
  });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", {
    document: doc,
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { href: "http://localhost:3000/" },
  });
  return { jar, writes };
};

/** Adds the Next.js-side /auth/* endpoints the browser client talks to. */
const installNextRoutes = (upstream: Upstream, prefix = "") => {
  const seen: { path: string; headers: Headers; method: string }[] = [];
  const record = (c: any) => seen.push({ path: c.path, headers: c.headers, method: c.method });
  upstream.on("GET", `${prefix}/auth/csrf`, (c) => {
    record(c);
    return new Response(CSRF);
  });
  upstream.on("POST", `${prefix}/auth/refresh`, (c) => {
    record(c);
    return new Response(null, { status: 401 });
  });
  upstream.on("POST", `${prefix}/auth/sign-out`, (c) => {
    record(c);
    return new Response(null, { status: 200 });
  });
  upstream.on("POST", `${prefix}/auth/sign-in`, (c) => {
    record(c);
    return new Response(null, { status: 200 });
  });
  return seen;
};

const browserPrefs = { fingerprinting: false, refetchInverval: 0 };

let upstream: Upstream;
let clients: any[] = [];

const load = async () => {
  vi.resetModules();
  return import("../clientComponentClient");
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  upstream = createUpstream().install();
  clients = [];
});

afterEach(async () => {
  await settle();
  for (const c of clients) c?.channel?.close?.();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("server side (no window)", () => {
  it("returns a new, unpatched client on every call", async () => {
    const { createClientComponentClient } = await load();
    const { ScuteClient } = await import("@scute/js-core");
    const a: any = createClientComponentClient({ appId: APP_ID, baseUrl: BASE_URL });
    const b: any = createClientComponentClient({ appId: APP_ID, baseUrl: BASE_URL });
    expect(a).not.toBe(b);
    expect(Object.prototype.hasOwnProperty.call(a, "signInWithTokenPayload")).toBe(false);
    expect(a.signInWithTokenPayload).toBe(ScuteClient.prototype.signInWithTokenPayload);
    expect(a.refreshProxyCallback).toBeNull();
    await settle();
    expect(upstream.calls.every((c) => !c.path.startsWith("/auth/"))).toBe(true);
  });

  // CURRENT BEHAVIOR (noted, not a bug): during SSR of a client component
  // the client is created server-side, so createScuteClient picks up
  // SCUTE_SECRET (isBrowser() is false). The secret stays on the server.
  it("picks up SCUTE_SECRET on the server", async () => {
    vi.stubEnv("SCUTE_SECRET", SECRET);
    const { createClientComponentClient } = await load();
    createClientComponentClient({ appId: APP_ID, baseUrl: BASE_URL });
    expect(upstream.calls[0].headers.get("authorization")).toBe(`Bearer ${SECRET}`);
  });
});

describe("browser", () => {
  const create = async (config: Record<string, unknown> = {}, cookies: Record<string, string> = {}) => {
    const browser = installBrowser(cookies);
    const nextCalls = installNextRoutes(upstream, (config.handlersPrefix as string) ? `/${config.handlersPrefix}` : "");
    const mod = await load();
    const client: any = mod.createClientComponentClient({
      appId: APP_ID,
      baseUrl: BASE_URL,
      ...config,
      preferences: { ...browserPrefs, ...((config.preferences as object) ?? {}) },
    } as any);
    clients.push(client);
    await settle(10);
    return { ...browser, client, mod, nextCalls };
  };

  // Known limitation, tracked separately: in the browser the first client
  // is a module singleton; later calls return it whatever their config.
  it("returns the same singleton on every call, ignoring later config", async () => {
    const { client, mod } = await create();
    const again: any = mod.createClientComponentClient({ appId: "another-app", baseUrl: "https://other.example" });
    expect(again).toBe(client);
    expect(again.appId).toBe(APP_ID);
  });

  it("never sends the secret key from the browser", async () => {
    vi.stubEnv("SCUTE_SECRET", SECRET);
    await create({ secretKey: SECRET });
    for (const c of upstream.calls) expect(c.headers.get("authorization")).toBeNull();
  });

  it("on load with no session, asks the Next refresh proxy (csrf round trip) and stays signed out", async () => {
    const { nextCalls, client, writes } = await create();
    expect(nextCalls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /auth/csrf", "POST /auth/refresh"]);
    expect(nextCalls[1].headers.get("x-csrf-token")).toBe(CSRF);
    expect((await client.initialSessionState()).status).toBe("unauthenticated");
    expect(writes).toEqual([]);
  });

  it("reads the namespaced access cookie from document.cookie", async () => {
    const access = makeAccess();
    const { client } = await create({}, { [ACCESS_KEY]: access });
    const s = await client.initialSessionState();
    expect(s.access).toBe(access);
  });

  // CURRENT BEHAVIOR (REF-41 target): legacy unsuffixed cookie is read and
  // copied into the namespaced name as a session cookie (no expires).
  it("falls back to the legacy access cookie and migrates it via document.cookie (on load)", async () => {
    const legacy = makeAccess({ tag: "legacy" });
    const { client, writes, jar } = await create({}, { [LEGACY_ACCESS_KEY]: legacy });
    // the initial-session read on load already performed the migration
    expect(writes).toEqual([`${ACCESS_KEY}=${legacy}; path=/; sameSite=lax`]);
    expect(jar.get(ACCESS_KEY)).toBe(legacy);
    expect(jar.get(LEGACY_ACCESS_KEY)).toBe(legacy);
    const s = await client.initialSessionState();
    expect(s.access).toBe(legacy);
  });

  describe("patched signInWithTokenPayload (httpOnlyRefresh default)", () => {
    it("posts the access token to the Next sign-in handler with CSRF and never exposes the refresh token", async () => {
      const { client, nextCalls, jar, writes } = await create();
      nextCalls.length = 0;
      writes.length = 0;
      const access = makeAccess({ tag: "signin" });
      const refresh = makeRefresh({ tag: "must-not-leak" });
      // simulate the server handler setting the (non-HttpOnly) access cookie
      upstream.on("POST", "/auth/sign-in", (c) => {
        nextCalls.push({ path: c.path, headers: c.headers, method: c.method });
        jar.set(ACCESS_KEY, access);
        return new Response(null, { status: 200 });
      });
      const events: string[] = [];
      client.onAuthStateChange((e: string) => events.push(e));

      const result = await client.signInWithTokenPayload({ access, refresh, access_expires_at: "x" });
      await settle();

      expect(result).toEqual({ error: null });
      const signIn = nextCalls.find((c) => c.path === "/auth/sign-in")!;
      expect(signIn.headers.get("authorization")).toBe(`Bearer ${access}`);
      expect(signIn.headers.get("x-csrf-token")).toBe(CSRF);
      expect(signIn.headers.get("content-type")).toBe("application/json");
      expect(events).toContain("signed_in");

      // the refresh token never goes anywhere from the browser
      for (const c of upstream.calls) {
        expect(c.url).not.toContain(refresh);
        c.headers.forEach((v) => expect(v).not.toContain(refresh));
      }
      for (const w of writes) expect(w).not.toContain(refresh);
      expect(jar.has(REFRESH_KEY)).toBe(false);
      // remembered identifier is written client side (namespaced, SameSite=strict)
      expect(writes.some((w) => w.startsWith(`sct_last_login__${APP_ID}=u@example.com;`) && w.includes("sameSite=strict"))).toBe(true);
    });

    it("on a failed sign-in handler: clears the session and returns UnknownSignInError", async () => {
      const { client, writes } = await create({}, { [ACCESS_KEY]: makeAccess() });
      writes.length = 0;
      upstream.on("POST", "/auth/sign-in", () => new Response("CSRF error", { status: 401 }));
      const { UnknownSignInError } = await import("@scute/js-core");
      const result = await client.signInWithTokenPayload({ access: makeAccess(), refresh: makeRefresh() });
      expect(result.error).toBeInstanceOf(UnknownSignInError);
      const deleted = writes.map((w) => w.split("=")[0]);
      expect(deleted).toEqual(expect.arrayContaining([ACCESS_KEY, LEGACY_ACCESS_KEY, REFRESH_KEY, LEGACY_REFRESH_KEY]));
      for (const w of writes) expect(w).toContain("expires=");
    });

    it("emits MFA_ENROLLMENT_SUGGESTED before posting when the payload suggests it", async () => {
      const { client } = await create();
      const events: string[] = [];
      client.onAuthStateChange((e: string) => events.push(e));
      upstream.on("POST", "/auth/sign-in", () => new Response(null, { status: 500 }));
      await client.signInWithTokenPayload({
        access: makeAccess(),
        mfa_enrollment_suggested: true,
        mfa_grace_days_remaining: 3,
        available_methods: ["totp"],
      });
      await settle();
      expect(events).toContain("mfa_enrollment_suggested");
      expect(client._pendingMfaEnrollmentSuggestion).toEqual({
        mfa_grace_days_remaining: 3,
        available_methods: ["totp"],
      });
    });

    it("uses handlersPrefix for both the csrf and the handler request", async () => {
      const { client, nextCalls, jar } = await create({ handlersPrefix: "api" });
      nextCalls.length = 0;
      const access = makeAccess();
      upstream.on("POST", "/api/auth/sign-in", (c) => {
        nextCalls.push({ path: c.path, headers: c.headers, method: c.method });
        jar.set(ACCESS_KEY, access);
        return new Response(null, { status: 200 });
      });
      await client.signInWithTokenPayload({ access });
      expect(nextCalls.map((c) => c.path)).toEqual(["/api/auth/csrf", "/api/auth/sign-in"]);
    });
  });

  describe("refresh proxy", () => {
    it("refreshSession() goes through POST /auth/refresh and stores only the access token", async () => {
      const { client, writes, nextCalls } = await create();
      writes.length = 0;
      nextCalls.length = 0;
      const newAccess = makeAccess({ tag: "proxied" });
      upstream.on("POST", "/auth/refresh", (c) => {
        nextCalls.push({ path: c.path, headers: c.headers, method: c.method });
        return json({ access: newAccess, refresh: "server-should-never-send-this" });
      });
      const { data, error } = await client.refreshSession();
      expect(error).toBeNull();
      expect(data.access).toBe(newAccess);
      expect(data.refresh).toBeUndefined();
      expect(nextCalls.map((c) => c.path)).toEqual(["/auth/csrf", "/auth/refresh"]);
      expect(nextCalls[1].headers.get("x-csrf-token")).toBe(CSRF);
      expect(writes).toHaveLength(1);
      expect(writes[0]).toMatch(new RegExp(`^${ACCESS_KEY}=${newAccess.replace(/\./g, "\\.")}; path=/; expires=[^;]+; sameSite=lax$`));
      expect(writes.join("\n")).not.toContain("server-should-never-send-this");
    });

    it("a failed proxy refresh leaves the session untouched and writes nothing", async () => {
      const { client, writes } = await create();
      writes.length = 0;
      const { data, error } = await client.refreshSession();
      expect(error).toBeNull();
      expect(data.status).toBe("unauthenticated");
      expect(writes).toEqual([]);
    });
  });

  describe("sign-out propagation", () => {
    it("signOut() posts to the Next sign-out handler with CSRF", async () => {
      const { client, nextCalls } = await create({}, { [ACCESS_KEY]: makeAccess() });
      nextCalls.length = 0;
      await client.signOut();
      await settle();
      const so = nextCalls.find((c) => c.path === "/auth/sign-out")!;
      expect(so.method).toBe("POST");
      expect(so.headers.get("x-csrf-token")).toBe(CSRF);
    });

    it("a SESSION_EXPIRED event also posts to the sign-out handler", async () => {
      const { client, nextCalls } = await create();
      nextCalls.length = 0;
      client.emitAuthChangeEvent("session_expired");
      await settle(10);
      expect(nextCalls.map((c) => `${c.method} ${c.path}`)).toContain("POST /auth/sign-out");
    });
  });

  it("adds `secure` to document.cookie writes when NODE_ENV=production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { client, writes } = await create();
    writes.length = 0;
    await client.setSession({ access: makeAccess() });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("; secure");
  });

  describe("httpOnlyRefresh: false (opt-out)", () => {
    it("does not patch sign-in or install the refresh proxy", async () => {
      const { client, nextCalls } = await create({ preferences: { httpOnlyRefresh: false } });
      expect(Object.prototype.hasOwnProperty.call(client, "signInWithTokenPayload")).toBe(false);
      expect(client.refreshProxyCallback).toBeNull();
      expect(nextCalls).toEqual([]);
    });

    // CURRENT BEHAVIOR (by design, noted): with the opt-out the refresh
    // token is written to a JS-readable cookie by the browser SDK.
    it("stores the refresh token in a JS-readable cookie on sign-in", async () => {
      const { client, jar, writes } = await create({ preferences: { httpOnlyRefresh: false } });
      writes.length = 0;
      const refresh = makeRefresh({ tag: "readable" });
      await client.signInWithTokenPayload({ access: makeAccess(), refresh });
      expect(jar.get(REFRESH_KEY)).toBe(refresh);
      const w = writes.find((x) => x.startsWith(`${REFRESH_KEY}=`))!;
      expect(w.toLowerCase()).not.toContain("httponly");
    });
  });
});

describe("createPagesBrowserClient handlersPrefix mapping", () => {
  const prefixFor = async (handlersPrefix?: string) => {
    upstream.calls.length = 0;
    installBrowser();
    installNextRoutes(upstream, "");
    vi.resetModules();
    const { createPagesBrowserClient } = await import("../pagesBrowserClient");
    const client: any = createPagesBrowserClient({
      appId: APP_ID,
      baseUrl: BASE_URL,
      handlersPrefix,
      preferences: browserPrefs,
    } as any);
    clients.push(client);
    await settle(10);
    const first = upstream.calls.find((c) => c.path.endsWith("/auth/csrf"))!;
    return first.path;
  };

  it("defaults to /api/auth/*", async () => {
    expect(await prefixFor(undefined)).toBe("/api/auth/csrf");
  });

  it("prepends api/ to a custom prefix", async () => {
    expect(await prefixFor("custom")).toBe("/api/custom/auth/csrf");
  });

  it("keeps a prefix that already starts with 'api'", async () => {
    expect(await prefixFor("api/custom")).toBe("/api/custom/auth/csrf");
    expect(await prefixFor("api")).toBe("/api/auth/csrf");
  });

  it("ignores leading and trailing slashes when checking for 'api'", async () => {
    expect(await prefixFor("/api/custom")).toBe("/api/custom/auth/csrf");
    expect(await prefixFor("/api/")).toBe("/api/auth/csrf");
    expect(await prefixFor("/custom/")).toBe("/api/custom/auth/csrf");
  });

  it("matches 'api' as a whole path segment, not a text prefix", async () => {
    expect(await prefixFor("apiary")).toBe("/api/apiary/auth/csrf");
  });
});
