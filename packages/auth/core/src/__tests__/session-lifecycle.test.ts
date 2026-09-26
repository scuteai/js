/**
 * Characterization of the session lifecycle: initial state, getSession,
 * refresh (success, 401, network failure, 5xx), single-flight guards,
 * expiry margins, the auto-refresh ticker, sign out, onAuthStateChange and
 * cross-tab broadcast. Server-side (node) paths use a sessionStorageAdapter;
 * browser paths stub window/document/BroadcastChannel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../ScuteClient";
import { AUTH_CHANGE_EVENTS } from "../lib/constants";
import { BaseHttpError, InvalidAuthTokenError } from "../lib/errors";
import {
  accessToken,
  APP_ID,
  appDataFixture,
  AUTH_PREFIX,
  BASE_URL,
  createServer,
  deferred,
  FakeBroadcastChannel,
  installBrowser,
  internals,
  KEYS,
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

const REFRESH = `${AUTH_PREFIX}/tokens/refresh`;
const ROTATE = `${AUTH_PREFIX}/tokens/rotate_access`;
const CURRENT_USER = `${AUTH_PREFIX}/current_user`;

let server: TestServer;
let storage: MemoryAdapter;

const newClient = (preferences: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  createClient({
    appId: APP_ID,
    baseUrl: BASE_URL,
    preferences: { ...quietPreferences, sessionStorageAdapter: storage as any, ...preferences },
    ...extra,
  } as any);

/** A refresh endpoint that returns a fresh pair and remembers what it issued. */
const issueTokens = () => {
  const issued: Array<{ access: string; refresh: string }> = [];
  server.on("POST", REFRESH, () => {
    const pair = { access: accessToken({ expiresIn: 3600 }), refresh: refreshToken() };
    issued.push(pair);
    return { body: pair };
  });
  return issued;
};

beforeEach(() => {
  server = createServer();
  server.on("GET", CURRENT_USER, { body: { user: userFixture() } });
  storage = new MemoryAdapter();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getSession: initial state", () => {
  it("with nothing stored returns an unauthenticated session and InvalidAuthTokenError, without calling the API", async () => {
    const client = newClient();
    const { data, error } = await client.getSession();

    expect(data.session).toMatchObject({
      access: null,
      accessExpiresAt: null,
      status: "unauthenticated",
    });
    expect(data.user).toBeNull();
    expect(error).toBeInstanceOf(InvalidAuthTokenError);
    expect(server.calls.map((c) => c.path)).toEqual([`/v1/apps/${APP_ID}`]);
  });

  it("with a valid access token fetches the user and emits SESSION_REFETCH, without refreshing", async () => {
    const access = accessToken({ expiresIn: 3600 });
    const refresh = refreshToken();
    seedSession(storage, { access, refresh });
    const client = newClient();
    const rec = recordEvents(client);

    const { data, error } = await client.getSession();

    expect(error).toBeNull();
    expect(data.session).toMatchObject({ access, refresh, status: "authenticated" });
    expect(data.session!.accessExpiresAt).toBeInstanceOf(Date);
    expect(data.user).toEqual(userFixture());
    expect(server.callsTo("POST", REFRESH)).toHaveLength(0);
    const [call] = server.callsTo("GET", CURRENT_USER);
    expect(call.headers["x-authorization"]).toBe(access);
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.SESSION_REFETCH]);
    expect(rec.events[0].user).toEqual(userFixture());
  });

  it("an app data failure at construction is sticky: getSession keeps returning it after the API recovers", async () => {
    // CURRENT BEHAVIOR (suspected bug): _initialize() memoizes its first
    // result, including an error. One failed /v1/apps request during page
    // load leaves getSession() returning that error until a full reload,
    // even after getAppData(true) succeeds.
    server.on("GET", `/v1/apps/${APP_ID}`, { status: 500, body: { error: "down" } });
    seedSession(storage, { access: accessToken() });
    const client = newClient();

    const first = await client.getSession();
    expect(first.error).toBeInstanceOf(BaseHttpError);
    expect(first.data).toEqual({ session: null, user: null });

    server.on("GET", `/v1/apps/${APP_ID}`, { body: appDataFixture() });
    expect((await client.getAppData(true)).error).toBeNull();

    const second = await client.getSession();
    expect(second.error).toBe(first.error);
    expect(server.callsTo("GET", CURRENT_USER)).toHaveLength(0);
  });
});

describe("expiry margin (10 seconds) in getSession", () => {
  it("refreshes an access token that expires within 10 seconds", async () => {
    const issued = issueTokens();
    seedSession(storage, { access: accessToken({ expiresIn: 9 }), refresh: refreshToken() });
    const client = newClient();

    await client.getSession();
    expect(server.callsTo("POST", REFRESH)).toHaveLength(1);
    expect(issued).toHaveLength(1);
  });

  it("does not refresh an access token with more than 10 seconds left", async () => {
    issueTokens();
    seedSession(storage, { access: accessToken({ expiresIn: 11 }), refresh: refreshToken() });
    await newClient().getSession();
    expect(server.callsTo("POST", REFRESH)).toHaveLength(0);
  });

  it("refreshes an already expired access token", async () => {
    issueTokens();
    seedSession(storage, { access: accessToken({ expiresIn: -60 }), refresh: refreshToken() });
    await newClient().getSession();
    expect(server.callsTo("POST", REFRESH)).toHaveLength(1);
  });

  it("refreshes when only a refresh token is stored", async () => {
    issueTokens();
    seedSession(storage, { refresh: refreshToken() });
    const { data } = await newClient().getSession();
    expect(server.callsTo("POST", REFRESH)).toHaveLength(1);
    expect(data.session!.status).toBe("authenticated");
  });

  it("an undecodable access token is ignored and the refresh token is used", async () => {
    issueTokens();
    storage.seed(KEYS.access, "garbage");
    storage.seed(KEYS.refresh, refreshToken());
    await newClient().getSession();
    expect(server.callsTo("POST", REFRESH)).toHaveLength(1);
  });

  it("sends an expired refresh token anyway (no client-side refresh expiry check)", async () => {
    issueTokens();
    const staleRefresh = refreshToken({ expiresIn: -3600 });
    seedSession(storage, { access: accessToken({ expiresIn: -1 }), refresh: staleRefresh });
    await newClient().getSession();
    const [call] = server.callsTo("POST", REFRESH);
    expect(call.headers["x-refresh-token"]).toBe(staleRefresh);
  });
});

describe("refresh: success (server side / node path)", () => {
  it("POSTs the refresh token as X-Refresh-Token, persists the new pair and uses it", async () => {
    const issued = issueTokens();
    const oldRefresh = refreshToken();
    seedSession(storage, { access: accessToken({ expiresIn: 5 }), refresh: oldRefresh });
    const client = newClient();
    const rec = recordEvents(client);

    const { data, error } = await client.getSession();

    const [call] = server.callsTo("POST", REFRESH);
    expect(call.url).toBe(`${BASE_URL}${REFRESH}`);
    expect(call.headers["x-refresh-token"]).toBe(oldRefresh);
    expect(call.body).toBeUndefined();

    expect(error).toBeNull();
    expect(data.session).toMatchObject({
      access: issued[0].access,
      refresh: issued[0].refresh,
      status: "authenticated",
    });
    expect(storage.map.get(KEYS.access)).toBe(issued[0].access);
    expect(storage.map.get(KEYS.refresh)).toBe(issued[0].refresh);
    expect(server.callsTo("GET", CURRENT_USER)[0].headers["x-authorization"]).toBe(
      issued[0].access
    );
    expect(rec.names()).toEqual([
      AUTH_CHANGE_EVENTS.TOKEN_REFRESHED,
      AUTH_CHANGE_EVENTS.SESSION_REFETCH,
    ]);
  });

  it("emits TOKEN_REFRESHED (without a session) before the new tokens are persisted", async () => {
    issueTokens();
    const oldAccess = accessToken({ expiresIn: 5 });
    seedSession(storage, { access: oldAccess, refresh: refreshToken() });
    const client = newClient();

    let storedAtEmit: string | undefined;
    let payloadAtEmit: any;
    internals(client).emitter.on("authStateChanged", (p: any) => {
      if (p.event === AUTH_CHANGE_EVENTS.TOKEN_REFRESHED) {
        storedAtEmit = storage.map.get(KEYS.access);
        payloadAtEmit = p;
      }
    });

    await client.refreshSession();
    expect(storedAtEmit).toBe(oldAccess);
    expect(payloadAtEmit.session).toBeUndefined();
  });

  it("keeps the previous refresh token when the response carries none", async () => {
    const oldRefresh = refreshToken();
    const newAccess = accessToken();
    server.on("POST", REFRESH, { body: { access: newAccess } });
    seedSession(storage, { access: accessToken({ expiresIn: 5 }), refresh: oldRefresh });

    const { data } = await newClient().getSession();
    expect(data.session).toMatchObject({ access: newAccess, refresh: oldRefresh });
    expect(storage.map.get(KEYS.refresh)).toBe(oldRefresh);
  });

  it("with only an access token, rotates via /tokens/rotate_access with X-Authorization and the secret key", async () => {
    const oldAccess = accessToken({ expiresIn: 5 });
    const newAccess = accessToken();
    server.on("POST", ROTATE, { body: { access: newAccess } });
    seedSession(storage, { access: oldAccess });

    const { data } = await newClient({}, { secretKey: "sk_test_1" }).getSession();
    const [call] = server.callsTo("POST", ROTATE);
    expect(call.headers["x-authorization"]).toBe(oldAccess);
    expect(call.headers["authorization"]).toBe("Bearer sk_test_1");
    expect(data.session!.access).toBe(newAccess);
  });

  it("refreshSession() returns the refreshed session", async () => {
    const issued = issueTokens();
    seedSession(storage, { access: accessToken(), refresh: refreshToken() });
    const { data, error } = await newClient().refreshSession();
    expect(error).toBeNull();
    expect(data).toMatchObject({ access: issued[0].access, status: "authenticated" });
  });
});

describe("refresh: failures", () => {
  it("a 401 is terminal: exactly one refresh request, storage wiped, one SESSION_EXPIRED, no user fetch", async () => {
    server.on("POST", REFRESH, { status: 401, body: { error: "revoked" } });
    storage.seed(KEYS.legacyAccess, "legacy_access");
    seedSession(storage, { access: accessToken({ expiresIn: 5 }), refresh: refreshToken() });
    const client = newClient();
    const rec = recordEvents(client);

    const { data, error } = await client.getSession();

    expect(server.callsTo("POST", REFRESH)).toHaveLength(1);
    expect(server.callsTo("GET", CURRENT_USER)).toHaveLength(0);
    expect(storage.snapshot()).toEqual({});
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.SESSION_EXPIRED]);
    expect(rec.events[0].session).toEqual({
      access: null,
      accessExpiresAt: null,
      refresh: null,
      refreshExpiresAt: null,
      status: "unauthenticated",
    });
    expect(data.session!.status).toBe("unauthenticated");
    expect(data.user).toBeNull();
    // the caller sees the follow-on "no token" error, not the 401
    expect(error).toBeInstanceOf(InvalidAuthTokenError);

    // a later getSession does not retry: nothing left to refresh with
    await client.getSession();
    expect(server.callsTo("POST", REFRESH)).toHaveLength(1);
  });

  it("refreshSession() surfaces the 401 BaseHttpError and wipes storage", async () => {
    server.on("POST", REFRESH, { status: 401, body: { error: "revoked" } });
    seedSession(storage, { access: accessToken(), refresh: refreshToken() });
    const { data, error } = await newClient().refreshSession();
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(BaseHttpError);
    expect(error!.code).toBe(401);
    expect(storage.snapshot()).toEqual({});
  });

  // CURRENT BEHAVIOR (suspected bug): a transient network failure while
  // refreshing is handled exactly like a revoked token. After the retries
  // the session is expired and the refresh token deleted, so briefly going
  // offline near access-token expiry signs the user out.
  it("a network failure is retried 3 times and then wipes the session", async () => {
    vi.useFakeTimers();
    server.on("POST", REFRESH, new TypeError("fetch failed"));
    seedSession(storage, { access: accessToken({ expiresIn: 5 }), refresh: refreshToken() });
    const client = newClient();
    const rec = recordEvents(client);

    const pending = client.refreshSession();
    await vi.advanceTimersByTimeAsync(3000);
    const { error } = await pending;

    expect(server.callsTo("POST", REFRESH)).toHaveLength(4);
    expect(error).toBeInstanceOf(BaseHttpError);
    expect(error!.code).toBeUndefined();
    expect(storage.snapshot()).toEqual({});
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.SESSION_EXPIRED]);
  });

  // CURRENT BEHAVIOR (suspected risk): the generic retry middleware also
  // replays POST /tokens/refresh on 502/503/504. If the first attempt was
  // processed upstream and the refresh token rotated, the replays present
  // an already-used refresh token (reuse detection could revoke the family).
  it("a 503 on refresh is replayed 3 more times with the same refresh token", async () => {
    vi.useFakeTimers();
    server.on("POST", REFRESH, { status: 503, body: {} });
    const refresh = refreshToken();
    seedSession(storage, { access: accessToken({ expiresIn: 5 }), refresh });

    const pending = newClient().refreshSession();
    await vi.advanceTimersByTimeAsync(3000);
    await pending;

    const calls = server.callsTo("POST", REFRESH);
    expect(calls).toHaveLength(4);
    expect(new Set(calls.map((c) => c.headers["x-refresh-token"]))).toEqual(new Set([refresh]));
  });

  // CURRENT BEHAVIOR (suspected bug): any getCurrentUser failure during a
  // session refetch (including a transient 500) expires the session and
  // deletes the tokens, not only a 401.
  it("a 500 from /current_user during getSession wipes the session", async () => {
    server.on("GET", CURRENT_USER, { status: 500, body: { error: "db" } });
    seedSession(storage, { access: accessToken(), refresh: refreshToken() });
    const client = newClient();
    const rec = recordEvents(client);

    const { data, error } = await client.getSession();
    expect(error).toBeInstanceOf(BaseHttpError);
    expect(error!.code).toBe(500);
    expect(data.session!.status).toBe("unauthenticated");
    expect(storage.snapshot()).toEqual({});
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.SESSION_EXPIRED]);
  });

  it("a 401 from /current_user is mapped to InvalidAuthTokenError and wipes the session", async () => {
    server.on("GET", CURRENT_USER, { status: 401, body: {} });
    seedSession(storage, { access: accessToken() });
    const { error } = await newClient().getSession();
    expect(error).toBeInstanceOf(InvalidAuthTokenError);
    expect(storage.snapshot()).toEqual({});
  });
});

describe("single-flight guards", () => {
  it("two concurrent refreshSession() calls share one request and one result", async () => {
    const gate = deferred();
    const pair = { access: accessToken(), refresh: refreshToken() };
    server.on("POST", REFRESH, async () => {
      await gate.promise;
      return { body: pair };
    });
    seedSession(storage, { access: accessToken({ expiresIn: 5 }), refresh: refreshToken() });
    const client = newClient();
    await ready(client);

    const a = client.refreshSession();
    const b = client.refreshSession();
    await vi.waitFor(() => expect(server.callsTo("POST", REFRESH)).toHaveLength(1));
    gate.resolve();
    const [ra, rb] = await Promise.all([a, b]);

    expect(server.callsTo("POST", REFRESH)).toHaveLength(1);
    expect(ra.data).toBe(rb.data);
    expect(ra.data!.access).toBe(pair.access);
  });

  it("getSession() and refreshSession() racing share one refresh request", async () => {
    const gate = deferred();
    server.on("POST", REFRESH, async () => {
      await gate.promise;
      return { body: { access: accessToken(), refresh: refreshToken() } };
    });
    seedSession(storage, { access: accessToken({ expiresIn: 5 }), refresh: refreshToken() });
    const client = newClient();
    await ready(client);

    const a = client.getSession();
    const b = client.refreshSession();
    await vi.waitFor(() => expect(server.callsTo("POST", REFRESH)).toHaveLength(1));
    gate.resolve();
    await Promise.all([a, b]);
    expect(server.callsTo("POST", REFRESH)).toHaveLength(1);
  });

  it("the guard resets after completion: sequential refreshes each hit the API", async () => {
    issueTokens();
    seedSession(storage, { access: accessToken(), refresh: refreshToken() });
    const client = newClient();
    await client.refreshSession();
    await client.refreshSession();
    expect(server.callsTo("POST", REFRESH)).toHaveLength(2);
  });

  // CURRENT BEHAVIOR (suspected bug): _refresh() only clears its Deferred
  // after __refresh() returns normally. If anything inside throws (here the
  // storage adapter refusing a write, e.g. quota exceeded), the Deferred is
  // left set and never settled, so every later refresh (and any getSession
  // that needs one) hangs forever. _getSession and getCurrentUser use the
  // same pattern.
  it("a throw inside refresh wedges the guard: later refreshes never settle", async () => {
    issueTokens();
    seedSession(storage, { access: accessToken({ expiresIn: 5 }), refresh: refreshToken() });
    const client = newClient();
    await ready(client);

    const realSet = storage.setItem.bind(storage);
    storage.setItem = async () => {
      throw new Error("QuotaExceededError");
    };
    await expect(client.refreshSession()).rejects.toThrow("QuotaExceededError");

    storage.setItem = realSet;
    expect(await settledWithin(client.refreshSession())).toBe("pending");
    expect(server.callsTo("POST", REFRESH)).toHaveLength(1);
  });
});

describe("autoRefreshToken disabled", () => {
  // CURRENT BEHAVIOR (suspected bug): with autoRefreshToken off, an expired
  // access token triggers _expireSession() (event + storage wipe) but the
  // local `session` variable is not reset. getSession then still calls
  // /current_user with the expired token, and if the server accepts it
  // (clock skew, grace window) reports an authenticated session even though
  // storage was just wiped.
  it("expires storage but still reports the stale session when /current_user accepts it", async () => {
    const stale = accessToken({ expiresIn: -5 });
    seedSession(storage, { access: stale, refresh: refreshToken() });
    const client = newClient({ autoRefreshToken: false });
    const rec = recordEvents(client);

    const { data, error } = await client.getSession();

    expect(server.callsTo("POST", REFRESH)).toHaveLength(0);
    expect(storage.snapshot()).toEqual({});
    expect(server.callsTo("GET", CURRENT_USER)[0].headers["x-authorization"]).toBe(stale);
    expect(error).toBeNull();
    expect(data.session).toMatchObject({ access: stale, status: "authenticated" });
    expect(rec.names()).toEqual([
      AUTH_CHANGE_EVENTS.SESSION_EXPIRED,
      AUTH_CHANGE_EVENTS.SESSION_REFETCH,
    ]);
  });

  it("emits SESSION_EXPIRED twice when /current_user then rejects the stale token", async () => {
    server.on("GET", CURRENT_USER, { status: 401, body: {} });
    seedSession(storage, { access: accessToken({ expiresIn: -5 }) });
    const client = newClient({ autoRefreshToken: false });
    const rec = recordEvents(client);

    const { error } = await client.getSession();
    expect(error).toBeInstanceOf(InvalidAuthTokenError);
    expect(rec.names()).toEqual([
      AUTH_CHANGE_EVENTS.SESSION_EXPIRED,
      AUTH_CHANGE_EVENTS.SESSION_EXPIRED,
    ]);
  });
});

describe("getAuthToken", () => {
  // CURRENT BEHAVIOR (suspected bug): getAuthToken() reads storage only; it
  // neither checks expiry nor refreshes. Every authenticated helper (MFA,
  // alternate phones, sessions, ScuteVerifyApi) can send an expired token.
  it("returns an expired access token as-is, without refreshing", async () => {
    issueTokens();
    const expired = accessToken({ expiresIn: -600 });
    seedSession(storage, { access: expired, refresh: refreshToken() });
    const { data, error } = await newClient().getAuthToken();
    expect(error).toBeNull();
    expect(data!.access).toBe(expired);
    expect(server.callsTo("POST", REFRESH)).toHaveLength(0);
  });

  it("returns InvalidAuthTokenError when nothing is stored", async () => {
    const { data, error } = await newClient().getAuthToken();
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(InvalidAuthTokenError);
  });
});

describe("auto refresh ticker (30s tick, refresh when 3 or fewer ticks remain)", () => {
  const tick = (client: unknown) => internals(client)._autoRefreshTokenTick();

  it.each([
    [60, true],
    [119, true],
    [121, false],
    [3600, false],
  ])("access expiring in %is -> refresh: %s", async (expiresIn, shouldRefresh) => {
    issueTokens();
    seedSession(storage, { access: accessToken({ expiresIn }), refresh: refreshToken() });
    const client = newClient();
    await ready(client);

    await tick(client);
    expect(server.callsTo("POST", REFRESH)).toHaveLength(shouldRefresh ? 1 : 0);
  });

  it("does nothing when there is no session", async () => {
    const client = newClient();
    await ready(client);
    await tick(client);
    expect(server.callsTo("POST", REFRESH)).toHaveLength(0);
  });

  it("a refresh error on a tick expires the session", async () => {
    server.on("POST", REFRESH, { status: 401, body: {} });
    seedSession(storage, { access: accessToken({ expiresIn: 30 }), refresh: refreshToken() });
    const client = newClient();
    await ready(client);
    const rec = recordEvents(client);

    await tick(client);
    expect(storage.snapshot()).toEqual({});
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.SESSION_EXPIRED]);
  });

  it("startAutoRefresh ticks immediately and then every 30s; stopAutoRefresh stops it", async () => {
    vi.useFakeTimers();
    let n = 0;
    server.on("POST", REFRESH, () => {
      n++;
      // hand out tokens that are always inside the refresh window
      return { body: { access: accessToken({ expiresIn: 60 }), refresh: refreshToken() } };
    });
    seedSession(storage, { access: accessToken({ expiresIn: 60 }), refresh: refreshToken() });
    const client = newClient();
    await ready(client);

    await client.startAutoRefresh();
    await vi.advanceTimersByTimeAsync(1);
    expect(n).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(n).toBe(2);

    await client.stopAutoRefresh();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(n).toBe(2);
  });
});

describe("sign out", () => {
  it("emits SIGNED_OUT, wipes namespaced and legacy tokens and DELETEs /current_user with the access token", async () => {
    const access = accessToken();
    seedSession(storage, { access, refresh: refreshToken() });
    storage.seed(KEYS.legacyRefresh, "legacy_refresh");
    server.on("DELETE", CURRENT_USER, { status: 200, body: {} });
    const client = newClient();
    const rec = recordEvents(client);

    expect(await client.signOut()).toBe(true);

    const [call] = server.callsTo("DELETE", CURRENT_USER);
    expect(call.url).toBe(`${BASE_URL}${CURRENT_USER}`);
    expect(call.headers["x-authorization"]).toBe(access);
    expect(call.headers["x-refresh-token"]).toBeUndefined();
    expect(storage.snapshot()).toEqual({});
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.SIGNED_OUT]);
    expect(rec.events[0].session.status).toBe("unauthenticated");
  });

  it("with no session makes no API call and still reports success", async () => {
    const client = newClient();
    expect(await client.signOut()).toBe(true);
    expect(server.callsTo("DELETE", CURRENT_USER)).toHaveLength(0);
  });

  it("refreshes an expiring access token first, then revokes with the new one", async () => {
    const issued = issueTokens();
    seedSession(storage, { access: accessToken({ expiresIn: 5 }), refresh: refreshToken() });
    server.on("DELETE", CURRENT_USER, { status: 200, body: {} });
    await newClient().signOut();
    expect(server.callsTo("DELETE", CURRENT_USER)[0].headers["x-authorization"]).toBe(
      issued[0].access
    );
  });
});

describe("onAuthStateChange", () => {
  it("fires INITIAL_SESSION with the fetched user and does not emit SESSION_REFETCH", async () => {
    seedSession(storage, { access: accessToken() });
    const client = newClient();
    const rec = recordEvents(client);
    const cb = vi.fn();

    client.onAuthStateChange(cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));

    const [event, session, user] = cb.mock.calls[0];
    expect(event).toBe(AUTH_CHANGE_EVENTS.INITIAL_SESSION);
    expect(session.status).toBe("authenticated");
    expect(user).toEqual(userFixture());
    expect(rec.names()).toEqual([]);
  });

  it("fires INITIAL_SESSION with an unauthenticated session and null user when signed out", async () => {
    const client = newClient();
    const cb = vi.fn();
    client.onAuthStateChange(cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));
    expect(cb.mock.calls[0][0]).toBe(AUTH_CHANGE_EVENTS.INITIAL_SESSION);
    expect(cb.mock.calls[0][1].status).toBe("unauthenticated");
    expect(cb.mock.calls[0][2]).toBeNull();
  });

  it("passes non-session events through with a placeholder session, and stops after unsubscribe", async () => {
    server.on("POST", `${AUTH_PREFIX}/magic_links/login`, { body: { magic_link: { id: "ml_1" } } });
    const client = newClient();
    const cb = vi.fn();
    const unsubscribe = client.onAuthStateChange(cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));

    await client.sendLoginMagicLink("ada@example.com");
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(2));
    expect(cb.mock.calls[1]).toEqual([
      AUTH_CHANGE_EVENTS.MAGIC_PENDING,
      {
        access: null,
        accessExpiresAt: null,
        refresh: null,
        refreshExpiresAt: null,
        status: "unauthenticated",
      },
      null,
    ]);

    unsubscribe();
    await client.sendLoginMagicLink("ada@example.com");
    await new Promise((r) => setTimeout(r, 10));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("delivers SIGNED_IN with session and user without an extra /current_user fetch", async () => {
    const client = newClient();
    const cb = vi.fn();
    client.onAuthStateChange(cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));

    const access = accessToken();
    await client.signInWithTokenPayload({ access } as any);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(2));

    const [event, session, user] = cb.mock.calls[1];
    expect(event).toBe(AUTH_CHANGE_EVENTS.SIGNED_IN);
    expect(session.access).toBe(access);
    expect(user).toEqual(userFixture());
    expect(server.callsTo("GET", CURRENT_USER)).toHaveLength(1);
  });
});

describe("refresh proxy callback", () => {
  it("strips a refresh token from any payload once a proxy callback is set", async () => {
    const client = newClient();
    await client.setRefreshProxyCallback(async () => undefined);
    await client.signInWithTokenPayload({ access: accessToken(), refresh: refreshToken() } as any);
    expect(storage.map.has(KEYS.refresh)).toBe(false);
    expect(storage.map.has(KEYS.access)).toBe(true);
  });
});

describe("browser session paths", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  const browserClient = (preferences: Record<string, unknown> = {}) =>
    createClient({
      appId: APP_ID,
      baseUrl: BASE_URL,
      preferences: { ...quietPreferences, ...preferences },
    } as any);

  it("refreshes through the client's own endpoint with credentials: include", async () => {
    const { localStorage } = installBrowser();
    issueTokens();
    const refresh = refreshToken();
    localStorage.setItem(KEYS.access, accessToken({ expiresIn: 5 }));
    localStorage.setItem(KEYS.refresh, refresh);

    await browserClient().getSession();
    const [call] = server.callsTo("POST", REFRESH);
    expect(call.headers["x-refresh-token"]).toBe(refresh);
    expect(call.credentials).toBe("include");
  });

  it("the proxy callback is used when no refresh token is stored, and its errors are swallowed", async () => {
    const { localStorage } = installBrowser();
    const newAccess = accessToken();
    localStorage.setItem(KEYS.access, accessToken({ expiresIn: 5 }));
    const client = browserClient();
    const rec = recordEvents(client);
    const proxy = vi.fn(async () => ({ access: newAccess, refresh: refreshToken() }));
    await client.setRefreshProxyCallback(proxy);

    const { data } = await client.getSession();
    expect(proxy).toHaveBeenCalledTimes(1);
    expect(data.session!.access).toBe(newAccess);
    expect(localStorage.getItem(KEYS.refresh)).toBeNull();
    const refreshed = rec.events.find((e) => e.event === AUTH_CHANGE_EVENTS.TOKEN_REFRESHED);
    expect(refreshed?.session?.access).toBe(newAccess);

    // a throwing proxy is swallowed: no error surfaced, session untouched
    localStorage.setItem(KEYS.access, accessToken({ expiresIn: 5 }));
    await client.setRefreshProxyCallback(async () => {
      throw new Error("proxy down");
    });
    const second = await client.getSession();
    expect(second.error).toBeNull();
    expect(second.data.session!.status).toBe("authenticated");
  });

  it("the proxy callback is consulted even when nothing at all is stored", async () => {
    installBrowser();
    const client = browserClient();
    const proxy = vi.fn(async () => undefined);
    await client.setRefreshProxyCallback(proxy);
    await client.getSession();
    expect(proxy).toHaveBeenCalledTimes(1);
  });

  // CURRENT BEHAVIOR (suspected bug): in a browser, an expiring access token
  // with no readable refresh token and no proxy callback makes __refresh()
  // call _signOut(): storage is wiped and DELETE /current_user revokes the
  // session server-side, but no SIGNED_OUT event is emitted and the caller
  // keeps the stale session object. This is the state an httpOnly refresh
  // cookie (invisible to JS) produces.
  it("an expiring access token without a refresh token silently signs the user out server-side", async () => {
    const { localStorage } = installBrowser();
    const stale = accessToken({ expiresIn: 5 });
    localStorage.setItem(KEYS.access, stale);
    server.on("DELETE", CURRENT_USER, { status: 200, body: {} });
    const client = browserClient();
    const rec = recordEvents(client);

    const { data } = await client.getSession();

    expect(server.callsTo("DELETE", CURRENT_USER)).toHaveLength(1);
    expect(server.callsTo("DELETE", CURRENT_USER)[0].headers["x-authorization"]).toBe(stale);
    expect(localStorage.getItem(KEYS.access)).toBeNull();
    expect(rec.names()).not.toContain(AUTH_CHANGE_EVENTS.SIGNED_OUT);
    // the /current_user GET (here still 200) keeps the stale session alive
    expect(data.session).toMatchObject({ access: stale, status: "authenticated" });
  });

  it("broadcasts auth events to other tabs and re-emits inbound ones once (no echo)", async () => {
    installBrowser();
    const client = browserClient();
    await ready(client);
    const channel = FakeBroadcastChannel.instances.find(
      (c) => c.name === `sct_broadcast__${APP_ID}`
    )!;
    const rec = recordEvents(client);

    server.on("POST", `${AUTH_PREFIX}/magic_links/login`, { body: { magic_link: { id: "ml_1" } } });
    await client.sendLoginMagicLink("ada@example.com");
    expect(channel.posted).toEqual([
      {
        type: "authStateChanged",
        payload: { event: AUTH_CHANGE_EVENTS.MAGIC_PENDING, session: undefined, user: undefined },
      },
    ]);

    channel.deliver({ type: "authStateChanged", payload: { event: AUTH_CHANGE_EVENTS.SIGNED_OUT } });
    expect(rec.events.at(-1)).toEqual({ event: AUTH_CHANGE_EVENTS.SIGNED_OUT, _broadcasted: true });
    expect(channel.posted).toHaveLength(1);

    channel.deliver({ type: "somethingElse", payload: { event: "x" } });
    expect(rec.events.at(-1)!.event).toBe(AUTH_CHANGE_EVENTS.SIGNED_OUT);
  });

  it("does not wire the broadcast channel when persistSession is false", async () => {
    installBrowser();
    const client = browserClient({ persistSession: false });
    await ready(client);
    internals(client).emitAuthChangeEvent(AUTH_CHANGE_EVENTS.MAGIC_PENDING);
    const channel = FakeBroadcastChannel.instances.at(-1)!;
    expect(channel.posted).toHaveLength(0);
    expect(channel.onmessage).toBeNull();
  });

  it("does not wire the broadcast channel when app data failed to load", async () => {
    installBrowser();
    server.on("GET", `/v1/apps/${APP_ID}`, { status: 404, body: {} });
    const client = browserClient();
    await ready(client);
    expect(FakeBroadcastChannel.instances.at(-1)!.onmessage).toBeNull();
  });
});
