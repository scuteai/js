/**
 * Security-focused characterization of @scute/js-core. Each test pins what
 * the SDK does TODAY. Where that looks like a weakness the test is still
 * written to pass and carries a CURRENT BEHAVIOR comment explaining the
 * concern, so a refactor can change it deliberately rather than by accident.
 *
 * Related pins elsewhere: refresh single-flight, 401/network/5xx refresh
 * handling (session-lifecycle.test.ts), cookie attributes
 * (lib/__tests__/session-cookies.test.ts), passkeys fail-open
 * (mfa-results.test.ts), delete() swallowing errors (lib/__tests__/base-http.test.ts).
 */
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../ScuteClient";
import { AUTH_CHANGE_EVENTS } from "../lib/constants";
import { InvalidMagicLinkError, SsoRequiredError } from "../lib/errors";
import {
  accessToken,
  APP_ID,
  appDataFixture,
  AUTH_PREFIX,
  BASE_URL,
  captureUnhandledRejections,
  createServer,
  deferred,
  FakeBroadcastChannel,
  installBrowser,
  KEYS,
  magicLinkToken,
  MemoryAdapter,
  quietPreferences,
  ready,
  recordEvents,
  refreshToken,
  seedSession,
  userFixture,
  type TestServer,
} from "./harness";

const CURRENT_USER = `${AUTH_PREFIX}/current_user`;
const REFRESH = `${AUTH_PREFIX}/tokens/refresh`;

let server: TestServer;
let storage: MemoryAdapter;

const nodeClient = (extra: Record<string, unknown> = {}) =>
  createClient({
    appId: APP_ID,
    baseUrl: BASE_URL,
    preferences: { ...quietPreferences, sessionStorageAdapter: storage as any },
    ...extra,
  } as any);

const browserClient = (preferences: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  createClient({
    appId: APP_ID,
    baseUrl: BASE_URL,
    preferences: { ...quietPreferences, ...preferences },
    ...extra,
  } as any);

beforeEach(() => {
  server = createServer();
  server.on("GET", CURRENT_USER, { body: { user: userFixture() } });
  storage = new MemoryAdapter();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("where tokens are stored (plain, non-Next path)", () => {
  // CURRENT BEHAVIOR (security weakness): with no adapter, a browser client
  // stores BOTH the access token and the long-lived refresh token in
  // window.localStorage, readable by any script on the origin (one XSS
  // exfiltrates a refresh token valid for weeks). The cookie attributes
  // (httpOnly, sameSite, expires) are passed to localStorage.setItem and
  // silently ignored.
  it("a browser client keeps the refresh token in window.localStorage", async () => {
    const { localStorage } = installBrowser();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = browserClient();
    const refresh = refreshToken();
    await client.signInWithTokenPayload({ access: accessToken(), refresh } as any);

    expect(localStorage.getItem(KEYS.refresh)).toBe(refresh);
    expect(Object.keys(localStorage.snapshot()).sort()).toEqual(
      [KEYS.access, KEYS.lastLogin, KEYS.refresh].sort()
    );
  });

  it("the stored identifier (email) is kept in plain text for 400 days next to the tokens", async () => {
    const { localStorage } = installBrowser();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.on("DELETE", CURRENT_USER, { status: 200, body: {} });
    const client = browserClient();
    await client.signInWithTokenPayload({ access: accessToken() } as any);
    await client.signOut();
    expect(localStorage.getItem(KEYS.lastLogin)).toBe("ada@example.com");
    expect(localStorage.getItem(KEYS.access)).toBeNull();
  });

  // CURRENT BEHAVIOR (security weakness): outside a browser without an
  // adapter (and with persistSession: false anywhere) the fallback storage
  // is ONE module-level Map shared by every ScuteClient in the process. On
  // a server that builds a client per request without an adapter, user A's
  // tokens are visible to the client serving user B (same appId).
  it("the non-browser fallback storage is shared by every client in the process", async () => {
    const appId = "app_shared_memory";
    server = createServer({ appId });
    server.on("GET", `/v1/auth/${appId}/current_user`, { body: { user: userFixture() } });
    server.on("DELETE", `/v1/auth/${appId}/current_user`, { status: 200, body: {} });
    const make = (preferences: Record<string, unknown> = {}) =>
      createClient({ appId, baseUrl: BASE_URL, preferences: { ...quietPreferences, ...preferences } });

    const requestForA = make();
    const tokenA = accessToken({ uuid: "user_A" });
    await requestForA.signInWithTokenPayload({ access: tokenA } as any);

    const requestForB = make();
    expect((await requestForB.getAuthToken()).data?.access).toBe(tokenA);

    const ephemeral = make({ persistSession: false });
    expect((await ephemeral.getAuthToken()).data?.access).toBe(tokenA);

    await requestForA.signOut();
  });
});

describe("cross-user data in shared clients", () => {
  // CURRENT BEHAVIOR (suspected bug): getCurrentUser() de-duplicates
  // in-flight calls WITHOUT looking at the token argument. Two concurrent
  // getUser(token) calls for different users on one client (e.g. a shared
  // server-side client verifying request tokens) both receive the first
  // user's record, and only one request is made.
  it("concurrent getUser() calls with different tokens both get the first user", async () => {
    const tokenA = accessToken({ uuid: "user_A" });
    const tokenB = accessToken({ uuid: "user_B" });
    const gate = deferred();
    server.on("GET", CURRENT_USER, async (call) => {
      await gate.promise;
      const id = call.headers["x-authorization"] === tokenA ? "user_A" : "user_B";
      return { body: { user: userFixture({ id }) } };
    });
    const client = nodeClient();
    await ready(client);

    const a = client.getUser(tokenA);
    const b = client.getUser(tokenB);
    await vi.waitFor(() => expect(server.callsTo("GET", CURRENT_USER)).toHaveLength(1));
    gate.resolve();
    const [ra, rb] = await Promise.all([a, b]);

    expect(ra.data.user!.id).toBe("user_A");
    expect(rb.data.user!.id).toBe("user_A");
    expect(server.callsTo("GET", CURRENT_USER)).toHaveLength(1);
  });
});

describe("token leakage: URLs, logs, error reports, events", () => {
  const runFullFlow = async () => {
    const access = accessToken({ expiresIn: 5 });
    const refresh = refreshToken();
    const next = { access: accessToken(), refresh: refreshToken() };
    server.on("POST", REFRESH, { body: next });
    server.on("DELETE", CURRENT_USER, { status: 200, body: {} });
    const client = nodeClient({ debug: true });

    await client.signInWithTokenPayload({ access, refresh } as any);
    await client.getSession();
    await client.listMfaMethods();
    await client.signOut();
    return [access, refresh, next.access, next.refresh];
  };

  it("tokens never appear in any request URL (only headers)", async () => {
    const tokens = await runFullFlow();
    expect(server.calls.length).toBeGreaterThan(3);
    for (const call of server.calls) {
      for (const token of tokens) expect(call.url).not.toContain(token);
    }
  });

  it("debug logging never prints a token", async () => {
    const spies = (["debug", "log", "info", "warn", "error"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {})
    );
    const tokens = await runFullFlow();
    const logged = spies.flatMap((s) => s.mock.calls).map((args) => inspect(args, { depth: 5 }));
    expect(spies[0]).toHaveBeenCalled();
    for (const line of logged) {
      for (const token of tokens) expect(line).not.toContain(token);
    }
  });

  // CURRENT BEHAVIOR (security weakness): error reports include
  // `location: window.location.toString()`. When a 5xx happens while the
  // magic link is being verified, the report sent to /errors carries the
  // still-valid one-time sct_magic token from the address bar.
  it("a 5xx during magic link verification reports the URL including the sct_magic token", async () => {
    const token = magicLinkToken();
    installBrowser({ href: `https://app.test/cb?sct_magic=${token}` });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.on("PATCH", `${AUTH_PREFIX}/magic_links/authenticate`, { status: 500, body: {} });
    server.on("POST", `${AUTH_PREFIX}/errors`, { body: {} });
    const client = browserClient({}, { errorReporting: true });
    await ready(client);

    await client.verifyMagicLink();
    await vi.waitFor(() => expect(server.callsTo("POST", `${AUTH_PREFIX}/errors`)).toHaveLength(1));

    const report = server.callsTo("POST", `${AUTH_PREFIX}/errors`)[0];
    expect(report.body.payload.error.location).toContain(`sct_magic=${token}`);
    expect(report.credentials).toBe("include");
  });

  // CURRENT BEHAVIOR (security weakness): SIGNED_IN events carry the whole
  // session, refresh token included. Every onAuthStateChange subscriber
  // receives it and, with persistSession, it is posted over the per-app
  // BroadcastChannel to every other tab of the origin.
  it("SIGNED_IN hands the refresh token to listeners and broadcasts it to other tabs", async () => {
    installBrowser();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = browserClient();
    await ready(client);
    const channel = FakeBroadcastChannel.instances.find((c) => c.name === `sct_broadcast__${APP_ID}`)!;
    const cb = vi.fn();
    client.onAuthStateChange(cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));

    const refresh = refreshToken();
    await client.signInWithTokenPayload({ access: accessToken(), refresh } as any);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(2));

    expect(cb.mock.calls[1][0]).toBe(AUTH_CHANGE_EVENTS.SIGNED_IN);
    expect(cb.mock.calls[1][1].refresh).toBe(refresh);
    const posted = channel.posted.find((m) => m.payload.event === AUTH_CHANGE_EVENTS.SIGNED_IN);
    expect(posted.payload.session.refresh).toBe(refresh);
    expect(posted.payload.user).toEqual(userFixture());
  });

  // CURRENT BEHAVIOR (low severity): inbound BroadcastChannel messages are
  // trusted. A message that carries both session and user is handed to
  // onAuthStateChange callbacks as-is, without re-reading storage or
  // calling /current_user. Only same-origin code can post to the channel.
  it("a forged cross-tab SIGNED_IN with session and user reaches callbacks unverified", async () => {
    installBrowser();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = browserClient();
    await ready(client);
    const channel = FakeBroadcastChannel.instances.find((c) => c.name === `sct_broadcast__${APP_ID}`)!;
    const cb = vi.fn();
    client.onAuthStateChange(cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));
    const userCalls = server.callsTo("GET", CURRENT_USER).length;

    const forgedUser = { id: "admin", email: "root@example.com" };
    const forgedSession = { access: "forged", status: "authenticated" };
    channel.deliver({
      type: "authStateChanged",
      payload: { event: AUTH_CHANGE_EVENTS.SIGNED_IN, session: forgedSession, user: forgedUser },
    });
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(2));

    expect(cb.mock.calls[1]).toEqual([AUTH_CHANGE_EVENTS.SIGNED_IN, forgedSession, forgedUser]);
    expect(server.callsTo("GET", CURRENT_USER)).toHaveLength(userCalls);
  });

  // CURRENT BEHAVIOR (reading note): the core never removes sct_magic /
  // sct_oauth from the address bar. scrubAuthTokensFromUrl is exported but
  // it is the caller's job to use it.
  it("signing in from the magic link URL leaves the token in window.location", async () => {
    const token = magicLinkToken();
    const { win } = installBrowser({ href: `https://app.test/cb?sct_magic=${token}` });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.on("PATCH", `${AUTH_PREFIX}/magic_links/authenticate`, {
      body: { access: accessToken(), refresh: refreshToken() },
    });
    const client = browserClient();

    expect(await client.signInWithMagicLink()).toEqual({ error: null });
    expect(win.location.href).toContain(`sct_magic=${token}`);
  });
});

describe("server-provided URLs and URL building", () => {
  // CURRENT BEHAVIOR (reading note): the core never navigates to a URL the
  // server supplies, but it exposes them verbatim with no scheme/origin
  // check. The SsoRequiredError docs tell apps to
  // window.location.assign(e.ssoLoginUrl), so a hostile or compromised API
  // response decides where the browser goes (javascript: included).
  it("SsoRequiredError.ssoLoginUrl and discoverSSO results are passed through unvalidated", async () => {
    server.on("GET", `${AUTH_PREFIX}/users`, {
      status: 403,
      body: {
        error_code: "sso_required",
        details: { sso_login_url: "javascript:alert(document.domain)", domain: "acme.com" },
      },
    });
    server.on("GET", "/v1/auth/saml/discover", {
      body: { saml_login_url: "https://evil.example/login", enforce_sso: true },
    });
    const client = nodeClient();

    const { error } = await client.admin.getUserByIdentifier("a@acme.com");
    expect(error).toBeInstanceOf(SsoRequiredError);
    expect((error as SsoRequiredError).ssoLoginUrl).toBe("javascript:alert(document.domain)");

    expect(await client.discoverSSO("a@acme.com")).toEqual({
      saml_login_url: "https://evil.example/login",
      enforce_sso: true,
    });
  });

  // CURRENT BEHAVIOR (suspected bug): the OAuth provider is concatenated
  // into the query string without encoding, so a provider value can inject
  // extra authorize parameters.
  it("getOAuthUrl does not encode the provider (query parameter injection)", () => {
    const url = new URL(nodeClient().getOAuthUrl("google&redirect_uri=https://evil.example"));
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("redirect_uri")).toBe("https://evil.example");
  });

  // CURRENT BEHAVIOR (suspected bug, low): path parameters (challenge tokens,
  // MFA method ids, session ids) are interpolated without encoding, so a
  // value containing ../ addresses a different API path.
  it("challenge tokens are not path-encoded (../ reaches another endpoint)", async () => {
    const client = nodeClient();
    await ready(client);
    await client.getChallengeStatus(`../../../apps/${APP_ID}`);
    const last = server.calls.at(-1)!;
    expect(last.url).toContain("/challenges/../../../apps/");
    expect(last.path).toBe(`/v1/apps/${APP_ID}`);
  });
});

describe("CSRF and credentials", () => {
  // CURRENT BEHAVIOR (reading note): the core sends no CSRF token header on
  // any state-changing request and always uses credentials: "include"
  // (client and admin). CSRF protection lives only in the Next.js handler
  // layer; plain-core integrations rely on the API's own checks.
  it("state-changing requests carry cookies but no CSRF header", async () => {
    seedSession(storage, { access: accessToken() });
    server.on("POST", `${AUTH_PREFIX}/magic_links/login`, { body: {} });
    server.on("PATCH", `${AUTH_PREFIX}/current_user/meta`, { body: {} });
    server.on("DELETE", CURRENT_USER, { status: 200, body: {} });
    const client = nodeClient();

    await client.sendLoginMagicLink("ada@example.com");
    await client.updateUserMeta({ plan: "pro" } as any);
    await client.signOut();

    const mutating = server.calls.filter((c) => c.method !== "GET");
    expect(mutating.map((c) => c.method).sort()).toEqual(["DELETE", "PATCH", "POST"]);
    for (const call of mutating) {
      expect(call.credentials).toBe("include");
      expect(Object.keys(call.headers).some((h) => /csrf/i.test(h))).toBe(false);
    }
  });
});

describe("fail-open server flags", () => {
  // CURRENT BEHAVIOR (fail-open flag): in a browser, after app data loads,
  // config.autoRefreshToken is overwritten with `appData.auto_refresh !==
  // false`. A missing field turns auto refresh ON even when the integrator
  // passed autoRefreshToken: false, and the server value always wins.
  it("a missing auto_refresh field overrides autoRefreshToken: false and refreshes", async () => {
    const appData = appDataFixture();
    delete (appData as any).auto_refresh;
    server.on("GET", `/v1/apps/${APP_ID}`, { body: appData });
    server.on("POST", REFRESH, { body: { access: accessToken(), refresh: refreshToken() } });
    const { localStorage } = installBrowser();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(KEYS.access, accessToken({ expiresIn: 5 }));
    localStorage.setItem(KEYS.refresh, refreshToken());

    await browserClient({ autoRefreshToken: false }).getSession();
    expect(server.callsTo("POST", REFRESH)).toHaveLength(1);
  });

  it("auto_refresh: false from the server overrides autoRefreshToken: true and expires instead", async () => {
    server.on("GET", `/v1/apps/${APP_ID}`, { body: appDataFixture({ auto_refresh: false }) });
    const { localStorage } = installBrowser();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(KEYS.access, accessToken({ expiresIn: 5 }));
    localStorage.setItem(KEYS.refresh, refreshToken());
    const client = browserClient({ autoRefreshToken: true });
    const rec = recordEvents(client);

    await client.getSession();
    expect(server.callsTo("POST", REFRESH)).toHaveLength(0);
    expect(rec.names()).toContain(AUTH_CHANGE_EVENTS.SESSION_EXPIRED);
    expect(localStorage.getItem(KEYS.refresh)).toBeNull();
  });
});

describe("secret key handling", () => {
  // CURRENT BEHAVIOR (security weakness): a secretKey given to a browser
  // client only triggers a console warning. The key is then attached as
  // Authorization: Bearer to every admin request, including the public app
  // data fetch and the end user's sign out.
  it("a secretKey in the browser is warned about but still sent on admin requests", async () => {
    installBrowser();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    server.on("DELETE", CURRENT_USER, { status: 200, body: {} });
    const client = browserClient({}, { secretKey: "sk_live_leaky" });
    await ready(client);

    expect(warn.mock.calls.some(([m]) => String(m).includes("DANGER"))).toBe(true);
    expect(server.callsTo("GET", `/v1/apps/${APP_ID}`)[0].headers.authorization).toBe(
      "Bearer sk_live_leaky"
    );

    await client.signInWithTokenPayload({ access: accessToken() } as any);
    await client.signOut();
    expect(server.callsTo("DELETE", CURRENT_USER)[0].headers.authorization).toBe(
      "Bearer sk_live_leaky"
    );
  });

  it("a server-side client sends the secret key only on admin requests, not on end-user ones", async () => {
    seedSession(storage, { access: accessToken() });
    server.on("GET", `${AUTH_PREFIX}/mfa/methods`, { body: {} });
    const client = nodeClient({ secretKey: "sk_server" });
    await client.listMfaMethods();
    expect(server.callsTo("GET", `/v1/apps/${APP_ID}`)[0].headers.authorization).toBe("Bearer sk_server");
    expect(server.callsTo("GET", `${AUTH_PREFIX}/mfa/methods`)[0].headers.authorization).toBeUndefined();
  });
});

describe("revocation results", () => {
  // CURRENT BEHAVIOR (security weakness): because ScuteBaseHttp.delete()
  // never awaits the response, sign out and session revocation report
  // success even when the API refused them, and they resolve before the
  // request has finished (a navigation right after signOut() can cancel
  // the revocation). The failure leaks as an unhandled rejection.
  it("signOut() returns true although the server failed to revoke the session", async () => {
    seedSession(storage, { access: accessToken(), refresh: refreshToken() });
    server.on("DELETE", CURRENT_USER, { status: 500, body: { error: "not revoked" } });
    const client = nodeClient();
    await ready(client);

    let result: boolean | undefined;
    const leaked = await captureUnhandledRejections(async () => {
      result = await client.signOut();
    });

    expect(result).toBe(true);
    expect(storage.snapshot()).toEqual({});
    expect(leaked).toHaveLength(1);
    expect((leaked[0] as any).status).toBe(500);
  });

  it("revokeSession() reports no error although the server answered 403", async () => {
    seedSession(storage, { access: accessToken() });
    server.on("DELETE", `${AUTH_PREFIX}/sessions/s_other`, { status: 403, body: { error: "forbidden" } });
    const client = nodeClient();
    await ready(client);

    let result: unknown;
    const leaked = await captureUnhandledRejections(async () => {
      result = await client.revokeSession("s_other", "cred_x");
    });

    expect(result).toEqual({ data: null, error: null });
    expect((leaked[0] as any).status).toBe(403);
  });
});

describe("refresh loop safety with a subscriber", () => {
  it("a 401 on refresh during INITIAL_SESSION does not loop: one refresh, callbacks settle", async () => {
    server.on("POST", REFRESH, { status: 401, body: {} });
    seedSession(storage, { access: accessToken({ expiresIn: 5 }), refresh: refreshToken() });
    const client = nodeClient();
    const cb = vi.fn();

    client.onAuthStateChange(cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 30));

    expect(server.callsTo("POST", REFRESH)).toHaveLength(1);
    expect(cb.mock.calls.map((c) => c[0])).toEqual([
      AUTH_CHANGE_EVENTS.SESSION_EXPIRED,
      AUTH_CHANGE_EVENTS.INITIAL_SESSION,
    ]);
    expect(cb.mock.calls[1][1].status).toBe("unauthenticated");
  });
});

describe("side effects of client-side error handling", () => {
  // CURRENT BEHAVIOR (suspected bug): _reportClientError() calls
  // getSession() BEFORE checking whether error reporting is enabled. So a
  // purely local error (here: verifyMagicLink on a URL without a token)
  // fetches /current_user, and if that fetch fails the session is wiped.
  it("a local validation error can sign the user out via the reporting path, even with reporting off", async () => {
    seedSession(storage, { access: accessToken(), refresh: refreshToken() });
    server.on("GET", CURRENT_USER, { status: 500, body: {} });
    const client = nodeClient();
    await ready(client);

    const { error } = await client.verifyMagicLink("https://app.test/cb?no_token=1");
    expect(error).toBeInstanceOf(InvalidMagicLinkError);

    await vi.waitFor(() => expect(server.callsTo("GET", CURRENT_USER)).toHaveLength(1));
    await vi.waitFor(() => expect(storage.snapshot()).toEqual({}));
  });

  // CURRENT BEHAVIOR (suspected bug): verifyMagicLinkToken always reads
  // window.location (for sct_sk), so it throws a ReferenceError in any
  // non-browser runtime, even when given the token directly.
  it("verifyMagicLinkToken throws outside a browser", async () => {
    const client = nodeClient();
    await expect(client.verifyMagicLinkToken(magicLinkToken())).rejects.toThrow(ReferenceError);
  });
});
