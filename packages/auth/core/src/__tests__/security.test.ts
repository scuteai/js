/**
 * Security-focused characterization of @scute/js-core. Each test pins what
 * the SDK does today. Behavior that is a known limitation still passes and
 * carries a short "Known limitation" note, so a refactor can change it
 * deliberately rather than by accident.
 *
 * Related pins elsewhere: refresh single-flight, 401/network/5xx refresh
 * handling (session-lifecycle.test.ts), cookie attributes
 * (lib/__tests__/session-cookies.test.ts), passkeys gating
 * (mfa-results.test.ts), delete() error mapping (lib/__tests__/base-http.test.ts).
 */
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../ScuteClient";
import { AUTH_CHANGE_EVENTS } from "../lib/constants";
import { BaseHttpError, InvalidMagicLinkError, SsoRequiredError } from "../lib/errors";
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
  settledWithin,
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
  // Known limitation, tracked separately: without an adapter a browser client
  // keeps both tokens in window.localStorage (cookie attributes do not apply).
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

  // Outside a browser without an adapter (and with persistSession: false
  // anywhere) each client gets its own in-memory store.
  it("the in-memory fallback storage is per client, never shared across clients", async () => {
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
    expect((await requestForB.getAuthToken()).data).toBeNull();

    const ephemeral = make({ persistSession: false });
    expect((await ephemeral.getAuthToken()).data).toBeNull();
    const tokenE = accessToken({ uuid: "user_E" });
    await ephemeral.signInWithTokenPayload({ access: tokenE } as any);

    expect((await requestForA.getAuthToken()).data?.access).toBe(tokenA);
    expect((await ephemeral.getAuthToken()).data?.access).toBe(tokenE);
    expect((await requestForB.getAuthToken()).data).toBeNull();

    await requestForA.signOut();
    expect((await requestForA.getAuthToken()).data).toBeNull();
    expect((await ephemeral.getAuthToken()).data?.access).toBe(tokenE);
  });
});

describe("cross-user data in shared clients", () => {
  // getCurrentUser() de-duplicates in-flight calls per access token.
  it("concurrent getUser() calls with different tokens each get their own user", async () => {
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
    await vi.waitFor(() => expect(server.callsTo("GET", CURRENT_USER)).toHaveLength(2));
    gate.resolve();
    const [ra, rb] = await Promise.all([a, b]);

    expect(ra.data.user!.id).toBe("user_A");
    expect(rb.data.user!.id).toBe("user_B");
    expect(server.callsTo("GET", CURRENT_USER).map((c) => c.headers["x-authorization"])).toEqual([
      tokenA,
      tokenB,
    ]);
  });

  it("concurrent getUser() calls with the same token still share one request", async () => {
    const token = accessToken({ uuid: "user_A" });
    const gate = deferred();
    server.on("GET", CURRENT_USER, async () => {
      await gate.promise;
      return { body: { user: userFixture({ id: "user_A" }) } };
    });
    const client = nodeClient();
    await ready(client);

    const a = client.getUser(token);
    const b = client.getUser(token);
    await vi.waitFor(() => expect(server.callsTo("GET", CURRENT_USER)).toHaveLength(1));
    gate.resolve();
    const [ra, rb] = await Promise.all([a, b]);

    expect(ra).toBe(rb);
    expect(server.callsTo("GET", CURRENT_USER)).toHaveLength(1);

    // the in-flight entry is released once settled
    await client.getUser(token);
    expect(server.callsTo("GET", CURRENT_USER)).toHaveLength(2);
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

  // Error reports carry the page location with Scute's sign-in params removed.
  it("a 5xx during magic link verification reports the URL without the sct_magic token", async () => {
    const token = magicLinkToken();
    installBrowser({ href: `https://app.test/cb?next=%2Fhome&sct_magic=${token}` });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.on("PATCH", `${AUTH_PREFIX}/magic_links/authenticate`, { status: 500, body: {} });
    server.on("POST", `${AUTH_PREFIX}/errors`, { body: {} });
    const client = browserClient({}, { errorReporting: true });
    await ready(client);

    await client.verifyMagicLink();
    await vi.waitFor(() => expect(server.callsTo("POST", `${AUTH_PREFIX}/errors`)).toHaveLength(1));

    const report = server.callsTo("POST", `${AUTH_PREFIX}/errors`)[0];
    expect(report.body.payload.error.location).toBe("https://app.test/cb?next=%2Fhome");
    expect(JSON.stringify(report.body)).not.toContain(token);
    expect(report.credentials).toBe("include");
  });

  // Known limitation, tracked separately: SIGNED_IN events carry the full
  // session, refresh token included, and are posted on the per-app channel.
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

  // Known limitation, tracked separately: an inbound channel message with a
  // session and user is passed to callbacks as-is, without a server check.
  it("an inbound cross-tab SIGNED_IN with session and user reaches callbacks without a server check", async () => {
    installBrowser();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = browserClient();
    await ready(client);
    const channel = FakeBroadcastChannel.instances.find((c) => c.name === `sct_broadcast__${APP_ID}`)!;
    const cb = vi.fn();
    client.onAuthStateChange(cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));
    const userCalls = server.callsTo("GET", CURRENT_USER).length;

    const remoteUser = { id: "admin", email: "root@example.com" };
    const remoteSession = { access: "remote_access", status: "authenticated" };
    channel.deliver({
      type: "authStateChanged",
      payload: { event: AUTH_CHANGE_EVENTS.SIGNED_IN, session: remoteSession, user: remoteUser },
    });
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(2));

    expect(cb.mock.calls[1]).toEqual([AUTH_CHANGE_EVENTS.SIGNED_IN, remoteSession, remoteUser]);
    expect(server.callsTo("GET", CURRENT_USER)).toHaveLength(userCalls);
  });

  // By design: the core never removes sct_magic /
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
  // The core never navigates itself, but the URLs it hands back are meant to
  // be navigated to (the SsoRequiredError docs suggest location.assign), so
  // only absolute http: and https: URLs are passed through.
  const ssoRequired = (ssoLoginUrl: string) =>
    server.on("GET", `${AUTH_PREFIX}/users`, {
      status: 403,
      body: {
        error_code: "sso_required",
        details: { sso_login_url: ssoLoginUrl, domain: "acme.com" },
      },
    });
  const discovery = (samlLoginUrl: string) =>
    server.on("GET", "/v1/auth/saml/discover", {
      body: { workspace_id: "ws_1", saml_login_url: samlLoginUrl, enforce_sso: true },
    });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,hi"],
    ["relative", "/v1/auth/app_test/saml/login"],
  ])("a %s login URL is dropped (ssoLoginUrl undefined, discoverSSO null)", async (_label, value) => {
    ssoRequired(value);
    discovery(value);
    const client = nodeClient();

    const { error } = await client.admin.getUserByIdentifier("a@acme.com");
    expect(error).toBeInstanceOf(SsoRequiredError);
    expect((error as SsoRequiredError).ssoLoginUrl).toBeUndefined();
    expect((error as SsoRequiredError).domain).toBe("acme.com");

    expect(await client.discoverSSO("a@acme.com")).toBeNull();
  });

  it("an https login URL is passed through unchanged", async () => {
    const loginUrl = `${BASE_URL}${AUTH_PREFIX}/saml/login`;
    ssoRequired(loginUrl);
    discovery(loginUrl);
    const client = nodeClient();

    const { error } = await client.admin.getUserByIdentifier("a@acme.com");
    expect((error as SsoRequiredError).ssoLoginUrl).toBe(loginUrl);

    expect(await client.discoverSSO("a@acme.com")).toEqual({
      workspace_id: "ws_1",
      saml_login_url: loginUrl,
      enforce_sso: true,
    });
  });

  it("getOAuthUrl encodes the provider, so it cannot add query parameters", () => {
    const url = new URL(nodeClient().getOAuthUrl("google&redirect_uri=https://other.example"));
    expect(url.searchParams.get("provider")).toBe("google&redirect_uri=https://other.example");
    expect(url.searchParams.has("redirect_uri")).toBe(false);
  });

  it("challenge tokens are path-encoded and stay inside /challenges/", async () => {
    const client = nodeClient();
    await ready(client);
    await client.getChallengeStatus(`../../../apps/${APP_ID}`);
    const last = server.calls.at(-1)!;
    expect(last.path).toBe(`${AUTH_PREFIX}/challenges/..%2F..%2F..%2Fapps%2F${APP_ID}`);
  });

  it("other id path parameters are encoded too", async () => {
    seedSession(storage, { access: accessToken() });
    const client = nodeClient();
    await ready(client);

    await client.removeMfaMethod("m/1");
    await client.revokeSession("s/1", "cred_1");
    await client.removeDeviceCredential("d?1");

    const paths = server.calls.filter((c) => c.method === "DELETE").map((c) => c.path);
    expect(paths).toEqual([
      `${AUTH_PREFIX}/mfa/methods/m%2F1`,
      `${AUTH_PREFIX}/sessions/s%2F1`,
      `${AUTH_PREFIX}/devices/d%3F1`,
    ]);
  });
});

describe("CSRF and credentials", () => {
  // By design: the core sends no CSRF token header on
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
  // Known limitation, tracked separately: in a browser, autoRefreshToken is
  // replaced by `appData.auto_refresh !== false` once app data loads.
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
  // Known limitation, tracked separately: a secretKey given to a browser
  // client only logs a warning and is then sent on every admin request.
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
  // Sign out and session revocation wait for the server and report its
  // answer. Sign out still clears the local session when the server fails.
  it("signOut() clears the local session but returns false when the server fails to revoke it", async () => {
    seedSession(storage, { access: accessToken(), refresh: refreshToken() });
    server.on("DELETE", CURRENT_USER, { status: 500, body: { error: "not revoked" } });
    const client = nodeClient();
    await ready(client);
    const rec = recordEvents(client);

    let result: boolean | undefined;
    const leaked = await captureUnhandledRejections(async () => {
      result = await client.signOut();
    });

    expect(result).toBe(false);
    expect(storage.snapshot()).toEqual({});
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.SIGNED_OUT]);
    expect(server.callsTo("DELETE", CURRENT_USER)).toHaveLength(1);
    expect(leaked).toHaveLength(0);
  });

  it("signOut() resolves only after the revocation request has completed", async () => {
    seedSession(storage, { access: accessToken() });
    const gate = deferred();
    server.on("DELETE", CURRENT_USER, async () => {
      await gate.promise;
      return { status: 200, body: {} };
    });
    const client = nodeClient();
    await ready(client);

    const pending = client.signOut();
    await vi.waitFor(() => expect(server.callsTo("DELETE", CURRENT_USER)).toHaveLength(1));
    expect(storage.snapshot()).toEqual({});
    expect(await settledWithin(pending)).toBe("pending");

    gate.resolve();
    expect(await pending).toBe(true);
  });

  it("revokeSession() returns the server's 403 as an error", async () => {
    seedSession(storage, { access: accessToken() });
    server.on("DELETE", `${AUTH_PREFIX}/sessions/s_other`, { status: 403, body: { error: "forbidden" } });
    const client = nodeClient();
    await ready(client);

    let result: any;
    const leaked = await captureUnhandledRejections(async () => {
      result = await client.revokeSession("s_other", "cred_x");
    });

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(BaseHttpError);
    expect(result.error.code).toBe(403);
    expect(result.error.json).toEqual({ error: "forbidden" });
    expect(leaked).toHaveLength(0);
  });

  it.each([
    ["removeMfaMethod", (c: any) => c.removeMfaMethod("m_1"), `${AUTH_PREFIX}/mfa/methods/m_1`],
    ["cancelChallenge", (c: any) => c.cancelChallenge("ch_1"), `${AUTH_PREFIX}/challenges/ch_1`],
    ["removeDeviceCredential", (c: any) => c.removeDeviceCredential("d_1"), `${AUTH_PREFIX}/devices/d_1`],
    ["removeAlternatePhone", (c: any) => c.removeAlternatePhone("+15551234567"), `${AUTH_PREFIX}/current_user/alternate_phones/%2B15551234567`],
    ["admin.deleteUser", (c: any) => c.admin.deleteUser("u_1"), `/v1/${APP_ID}/users/u_1`],
    ["admin.revokeUserSession", (c: any) => c.admin.revokeUserSession("u_1", "s_1"), `/v1/${APP_ID}/users/u_1/sessions/s_1`],
  ])("%s returns a failed DELETE as an error", async (_name, invoke, path) => {
    seedSession(storage, { access: accessToken() });
    server.on("DELETE", path, { status: 422, body: { error: "nope" } });
    const client = nodeClient({ secretKey: "sk_server" });
    await ready(client);

    const result = await invoke(client);
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(BaseHttpError);
    expect(result.error.code).toBe(422);
    expect(server.callsTo("DELETE", path)).toHaveLength(1);
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
  // With error reporting off, a local error never reaches the session.
  it("a local validation error with reporting off makes no request and leaves the session alone", async () => {
    const tokens = { access: accessToken(), refresh: refreshToken() };
    seedSession(storage, tokens);
    server.on("GET", CURRENT_USER, { status: 401, body: {} });
    const client = nodeClient();
    await ready(client);
    const before = server.calls.length;

    const { error } = await client.verifyMagicLink("https://app.test/cb?no_token=1");
    expect(error).toBeInstanceOf(InvalidMagicLinkError);

    await new Promise((r) => setTimeout(r, 20));
    expect(server.calls.length).toBe(before);
    expect(storage.map.get(KEYS.access)).toBe(tokens.access);
    expect(storage.map.get(KEYS.refresh)).toBe(tokens.refresh);
  });

  // Known limitation, tracked separately: verifyMagicLinkToken reads
  // window.location for sct_sk, so it throws outside a browser.
  it("verifyMagicLinkToken throws outside a browser", async () => {
    const client = nodeClient();
    await expect(client.verifyMagicLinkToken(magicLinkToken())).rejects.toThrow(ReferenceError);
  });
});
