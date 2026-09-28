/**
 * Characterization of ScuteClient construction and its HTTP surface:
 * required options and defaults, storage selection, URL builders, the
 * endpoint/method/header table for every public API method, the
 * sign-in / sign-up routing decisions, fingerprinting and debug output.
 * (Per-appId instance warnings and channel naming in the browser are
 * covered in scute-client-multi-instance.test.ts; SAML URL and
 * discoverSSO basics in saml.test.ts.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@fingerprintjs/fingerprintjs", () => ({
  load: async () => ({ get: async () => ({ visitorId: "fp_visitor_1" }) }),
}));

import ScuteClient, { createClient } from "../ScuteClient";
import { AUTH_CHANGE_EVENTS } from "../lib/constants";
import {
  BaseHttpError,
  IdentifierAlreadyExistsError,
  IdentifierNotRecognizedError,
  InvalidAuthTokenError,
  ScuteError,
  TechnicalError,
} from "../lib/errors";
import { version } from "../lib/version";
import { needsReverification } from "../lib/helpers";
import {
  accessToken,
  APP_ID,
  appDataFixture,
  AUTH_PREFIX,
  BASE_URL,
  createServer,
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
  userFixture,
  type TestServer,
} from "./harness";

let server: TestServer;
let storage: MemoryAdapter;

const newClient = (config: Record<string, unknown> = {}) => {
  const { preferences, ...rest } = config as { preferences?: Record<string, unknown> };
  return createClient({
    appId: APP_ID,
    baseUrl: BASE_URL,
    preferences: { ...quietPreferences, sessionStorageAdapter: storage as any, ...preferences },
    ...rest,
  } as any);
};

beforeEach(() => {
  server = createServer();
  server.on("GET", `${AUTH_PREFIX}/current_user`, { body: { user: userFixture() } });
  storage = new MemoryAdapter();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("construction", () => {
  it.each([
    ["undefined", undefined],
    ["empty string", ""],
    ["numeric 0", 0],
  ])("throws ScuteError for appId %s, before any request", (_label, appId) => {
    expect(() => createClient({ appId } as any)).toThrow(ScuteError);
    expect(() => createClient({ appId } as any)).toThrow("Scute appId is required!");
    expect(server.fetch).not.toHaveBeenCalled();
  });

  it("createClient returns a ScuteClient exposing appId, baseUrl, admin and verifications", () => {
    const client = newClient();
    expect(client).toBeInstanceOf(ScuteClient);
    expect(client.appId).toBe(APP_ID);
    expect(client.baseUrl).toBe(BASE_URL);
    expect(client.admin).toBeDefined();
    expect(client.verifications).toBeDefined();
  });

  it("defaults baseUrl to https://api.scute.io", async () => {
    const client = createClient({
      appId: APP_ID,
      preferences: { sessionStorageAdapter: storage as any },
    });
    await ready(client);
    expect(client.baseUrl).toBe("https://api.scute.io");
    expect(server.calls[0].url).toBe(`https://api.scute.io/v1/apps/${APP_ID}`);
    expect(client.getOAuthUrl("google")).toBe(
      `https://api.scute.io/v1/auth/${APP_ID}/oauth/authorize?provider=google`
    );
  });

  it("does not normalize a trailing slash in baseUrl", () => {
    const client = newClient({ baseUrl: "https://api.test/" });
    expect(client.getOAuthUrl("google")).toBe(
      `https://api.test//v1/auth/${APP_ID}/oauth/authorize?provider=google`
    );
  });

  it("keeps a numeric appId as a number and uses it in paths", async () => {
    server.on("GET", "/v1/apps/42", { body: appDataFixture({ id: 42 }) });
    const client = newClient({ appId: 42 });
    await ready(client);
    expect(client.appId).toBe(42);
    expect(server.calls[0].path).toBe("/v1/apps/42");
  });

  it("fetches app data exactly once at construction and caches it", async () => {
    const client = newClient();
    await ready(client);
    expect(await client.getAppData()).toEqual({ data: appDataFixture(), error: null });
    expect(server.callsTo("GET", `/v1/apps/${APP_ID}`)).toHaveLength(1);

    const fresh = appDataFixture({ name: "Renamed" });
    server.on("GET", `/v1/apps/${APP_ID}`, { body: fresh });
    expect((await client.getAppData(true)).data).toEqual(fresh);
    expect(server.callsTo("GET", `/v1/apps/${APP_ID}`)).toHaveLength(2);
  });

  it("getAppData returns { data: null, error } when the app cannot be loaded", async () => {
    server.on("GET", `/v1/apps/${APP_ID}`, { status: 404, body: { error: "no app" } });
    const client = newClient();
    const { data, error } = await client.getAppData();
    expect(data).toBeNull();
    expect((error as BaseHttpError).code).toBe(404);
  });

  it("applies default preferences", () => {
    const client = createClient({
      appId: APP_ID,
      baseUrl: BASE_URL,
      preferences: { sessionStorageAdapter: storage as any },
    });
    expect(internals(client).config).toEqual({
      persistSession: true,
      autoRefreshToken: true,
      refetchOnWindowFocus: true,
      refetchInverval: 300,
    });
  });

  it("keeps explicit preferences (refetchInverval 0 is not replaced by the default)", () => {
    const client = newClient({
      preferences: { autoRefreshToken: false, refetchOnWindowFocus: false, refetchInverval: 0 },
    });
    expect(internals(client).config).toMatchObject({
      autoRefreshToken: false,
      refetchOnWindowFocus: false,
      refetchInverval: 0,
    });
  });

  it("calls onBeforeInitialize bound to the client, before the app data request", () => {
    let seenAppId: unknown;
    let callsAtHook = -1;
    newClient({
      onBeforeInitialize(this: ScuteClient) {
        seenAppId = this.appId;
        callsAtHook = server.fetch.mock.calls.length;
      },
    });
    expect(seenAppId).toBe(APP_ID);
    expect(callsAtHook).toBe(0);
  });

  it("logs through console.debug with a versioned prefix only when debug is true", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    await ready(newClient());
    expect(debug).not.toHaveBeenCalled();

    await ready(newClient({ debug: true }));
    expect(debug).toHaveBeenCalled();
    expect(debug.mock.calls[0][0]).toMatch(new RegExp(`^ScuteClient \\(${version}\\) \\d{4}-`));
  });

  it("outside a browser creates no BroadcastChannel and does not warn about duplicates", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bc = vi.fn();
    vi.stubGlobal("BroadcastChannel", bc);
    newClient();
    newClient();
    expect(bc).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(internals(newClient()).channel).toBeNull();
  });

  it("wires ScuteVerifyApi to the client's current access token", async () => {
    const access = accessToken();
    seedSession(storage, { access });
    server.on("GET", `/v1/verify/${APP_ID}/verifications`, { body: { verifications: [] } });
    const client = newClient();

    await client.verifications.list({ status: "pending" });
    const [call] = server.callsTo("GET", `/v1/verify/${APP_ID}/verifications`);
    expect(call.headers["x-authorization"]).toBe(access);
    expect(call.query.get("status")).toBe("pending");
    expect(call.credentials).toBeUndefined();
  });
});

describe("storage selection", () => {
  it("uses the sessionStorageAdapter when one is given", async () => {
    const client = newClient();
    await client.signInWithTokenPayload({ access: accessToken() } as any);
    expect(storage.map.has(KEYS.access)).toBe(true);
  });

  it("persistSession: false ignores the adapter and uses in-memory storage", async () => {
    const client = newClient({ preferences: { persistSession: false } });
    const access = accessToken();
    await client.signInWithTokenPayload({ access } as any);
    expect(storage.ops).toHaveLength(0);
    expect((await client.getAuthToken()).data?.access).toBe(access);
  });

  it("in a browser without an adapter, uses window.localStorage", async () => {
    const { localStorage } = installBrowser();
    const client = createClient({ appId: APP_ID, baseUrl: BASE_URL, preferences: quietPreferences });
    const access = accessToken();
    const refresh = refreshToken();
    await client.signInWithTokenPayload({ access, refresh } as any);
    expect(localStorage.getItem(KEYS.access)).toBe(access);
    expect(localStorage.getItem(KEYS.refresh)).toBe(refresh);
    expect(localStorage.getItem(KEYS.lastLogin)).toBe("ada@example.com");
  });

  it("in a browser with an adapter, leaves localStorage untouched", async () => {
    const { localStorage } = installBrowser();
    const client = newClient();
    await client.signInWithTokenPayload({ access: accessToken() } as any);
    expect(localStorage.length).toBe(0);
    expect(storage.map.has(KEYS.access)).toBe(true);
  });

  // When window.localStorage throws on access (storage blocked by the
  // browser, sandboxed iframes, some privacy modes) the client falls back to
  // its own in-memory store.
  it("falls back to per-client memory when window.localStorage is inaccessible", async () => {
    const { win } = installBrowser();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    Object.defineProperty(win, "localStorage", {
      get() {
        throw new Error("SecurityError: access denied");
      },
    });
    server.on("DELETE", `${AUTH_PREFIX}/current_user`, { status: 200, body: {} });

    const client = createClient({ appId: APP_ID, baseUrl: BASE_URL, preferences: quietPreferences });
    const other = createClient({ appId: APP_ID, baseUrl: BASE_URL, preferences: quietPreferences });
    await ready(client);

    const access = accessToken();
    expect(await client.signInWithTokenPayload({ access } as any)).toEqual({ error: null });
    expect((await client.getAuthToken()).data?.access).toBe(access);
    expect((await other.getAuthToken()).data).toBeNull();

    expect(await client.signOut()).toBe(true);
    expect((await client.getAuthToken()).data).toBeNull();
  });
});

describe("URL builders and redirects", () => {
  it("getOAuthUrl appends the provider to the authorize endpoint", () => {
    expect(newClient().getOAuthUrl("github")).toBe(
      `${BASE_URL}${AUTH_PREFIX}/oauth/authorize?provider=github`
    );
  });

  it("signInWithOAuthProvider and signInWithSAML navigate window.location.href", () => {
    const { win } = installBrowser();
    const client = createClient({ appId: APP_ID, baseUrl: BASE_URL, preferences: quietPreferences });
    client.signInWithOAuthProvider("google");
    expect(win.location.href).toBe(`${BASE_URL}${AUTH_PREFIX}/oauth/authorize?provider=google`);
    client.signInWithSAML();
    expect(win.location.href).toBe(`${BASE_URL}${AUTH_PREFIX}/saml/login`);
  });

  it("getSamlLoginUrl still appends relay_state although the v2 API ignores it", () => {
    expect(newClient().getSamlLoginUrl("/after?x=1")).toBe(
      `${BASE_URL}${AUTH_PREFIX}/saml/login?relay_state=%2Fafter%3Fx%3D1`
    );
  });

  it("getMagicLinkToken prefers sct_magic, falls back to sct_oauth, else null", () => {
    const client = newClient();
    expect(client.getMagicLinkToken("https://app.test/?sct_magic=m&sct_oauth=o")).toBe("m");
    expect(client.getMagicLinkToken("https://app.test/?sct_oauth=o")).toBe("o");
    expect(client.getMagicLinkToken(new URL("https://app.test/?x=1"))).toBeNull();
  });

  it("getMagicLinkToken defaults to window.location.href and throws without a window", () => {
    const client = newClient();
    expect(() => client.getMagicLinkToken()).toThrow(ReferenceError);
    installBrowser({ href: "https://app.test/cb?sct_magic=from_window" });
    expect(client.getMagicLinkToken()).toBe("from_window");
  });
});

describe("authenticated endpoint table", () => {
  const ACCESS = accessToken();

  type Row = {
    name: string;
    invoke: (c: ScuteClient) => Promise<unknown>;
    method: string;
    path: string;
    body: unknown;
  };

  const rows: Row[] = [
    { name: "getUser()", invoke: (c) => c.getUser(), method: "GET", path: "/current_user", body: undefined },
    { name: "listMfaMethods", invoke: (c) => c.listMfaMethods(), method: "GET", path: "/mfa/methods", body: undefined },
    { name: "getMfaStatus()", invoke: (c) => c.getMfaStatus(), method: "GET", path: "/mfa/status", body: undefined },
    { name: "enrollMfa", invoke: (c) => c.enrollMfa({ method: "totp", name: "Phone" }), method: "POST", path: "/mfa/enroll", body: { method: "totp", name: "Phone" } },
    { name: "verifyMfaEnrollment", invoke: (c) => c.verifyMfaEnrollment("enr_1", "123456"), method: "POST", path: "/mfa/enroll/verify", body: { enrollment_id: "enr_1", code: "123456" } },
    { name: "removeMfaMethod", invoke: (c) => c.removeMfaMethod("m_1"), method: "DELETE", path: "/mfa/methods/m_1", body: undefined },
    { name: "setDefaultMfaMethod", invoke: (c) => c.setDefaultMfaMethod("m_1"), method: "PATCH", path: "/mfa/methods/m_1/default", body: {} },
    { name: "generateBackupCodes", invoke: (c) => c.generateBackupCodes(), method: "POST", path: "/mfa/backup-codes", body: {} },
    { name: "generateBackupCodes({ challenge })", invoke: (c) => c.generateBackupCodes({ challenge: "ch_9" }), method: "POST", path: "/mfa/backup-codes", body: { challenge: "ch_9" } },
    { name: "enrollMfa({ challenge })", invoke: (c) => c.enrollMfa({ method: "totp", challenge: "ch_9" }), method: "POST", path: "/mfa/enroll", body: { method: "totp", challenge: "ch_9" } },
    { name: "listAlternatePhones", invoke: (c) => c.listAlternatePhones(), method: "GET", path: "/current_user/alternate_phones", body: undefined },
    { name: "addAlternatePhone", invoke: (c) => c.addAlternatePhone("+15551234567", "work"), method: "POST", path: "/current_user/alternate_phones", body: { phone: "+15551234567", label: "work" } },
    { name: "verifyAlternatePhoneChallenge", invoke: (c) => c.verifyAlternatePhoneChallenge("ch_1", "111222"), method: "POST", path: "/current_user/alternate_phones/verify", body: { challenge_token: "ch_1", code: "111222" } },
    { name: "removeAlternatePhone", invoke: (c) => c.removeAlternatePhone("+1 555"), method: "DELETE", path: "/current_user/alternate_phones/%2B1%20555", body: undefined },
    { name: "updateUserMeta", invoke: (c) => c.updateUserMeta({ plan: "pro" } as any), method: "PATCH", path: "/current_user/meta", body: { user_meta: { plan: "pro" } } },
    { name: "listUserSessions", invoke: (c) => c.listUserSessions(), method: "GET", path: "/sessions", body: undefined },
    { name: "revokeSession(id, credentialId)", invoke: (c) => c.revokeSession("s_1", "cred_1"), method: "DELETE", path: "/sessions/s_1", body: undefined },
    { name: "removeDeviceCredential", invoke: (c) => c.removeDeviceCredential("d_1"), method: "DELETE", path: "/devices/d_1", body: undefined },
  ];

  it.each(rows)("$name -> $method $path with X-Authorization", async ({ invoke, method, path, body }) => {
    seedSession(storage, { access: ACCESS, refresh: refreshToken() });
    server.on(method, `${AUTH_PREFIX}${path}`, { status: 200, body: {} });
    const client = newClient();
    await ready(client);

    await invoke(client);

    const calls = server.callsTo(method, `${AUTH_PREFIX}${path}`);
    expect(calls).toHaveLength(1);
    expect(calls[0].headers["x-authorization"]).toBe(ACCESS);
    expect(calls[0].headers["authorization"]).toBeUndefined();
    expect(calls[0].credentials).toBe("include");
    expect(calls[0].body).toEqual(body);
  });

  it.each(rows.filter((r) => r.name !== "getUser()"))(
    "$name without a session returns InvalidAuthTokenError and sends nothing",
    async ({ invoke }) => {
      const client = newClient();
      await ready(client);
      const before = server.calls.length;

      const result = (await invoke(client)) as { error: unknown };
      expect(result.error).toBeInstanceOf(InvalidAuthTokenError);
      expect(server.calls.length).toBe(before);
    }
  );

  it("removeMfaMethod passes a verification's token as ?challenge=", async () => {
    seedSession(storage, { access: ACCESS, refresh: refreshToken() });
    server.on("DELETE", `${AUTH_PREFIX}/mfa/methods/m_1`, { status: 204, body: {} });
    const client = newClient();
    await ready(client);

    await client.removeMfaMethod("m_1", { challenge: "ch 9" });

    expect(server.callsTo("DELETE", `${AUTH_PREFIX}/mfa/methods/m_1`)[0].query.get("challenge")).toBe("ch 9");
  });

  it("needsReverification spots the API's verification_required refusal", async () => {
    seedSession(storage, { access: ACCESS, refresh: refreshToken() });
    server.on("POST", `${AUTH_PREFIX}/mfa/backup-codes`, {
      status: 403,
      body: { error: "Verify it's you first", error_code: "verification_required", details: { recent_sign_in_minutes: 10 } },
    });
    const client = newClient();
    await ready(client);

    const { error } = await client.generateBackupCodes();

    expect(needsReverification(error)).toBe(true);
    expect(needsReverification(new Error("x"))).toBe(false);
    expect(needsReverification(null)).toBe(false);
  });

  it("addDevice posts /devices/register with X-Authorization and returns a register error as { error }", async () => {
    seedSession(storage, { access: ACCESS });
    server.on("POST", `${AUTH_PREFIX}/devices/register`, { status: 400, body: { error: "nope" } });
    const client = newClient();

    const { data, error } = await client.addDevice();
    expect(data).toBeNull();
    expect((error as BaseHttpError).code).toBe(400);
    const [call] = server.callsTo("POST", `${AUTH_PREFIX}/devices/register`);
    expect(call.headers["x-authorization"]).toBe(ACCESS);
    expect(call.body).toBeUndefined();
  });

  // Known limitation, tracked separately: a /devices/register response
  // without `options` makes addDevice reject instead of returning { error }.
  it("addDevice rejects when the register response has no options", async () => {
    seedSession(storage, { access: ACCESS });
    server.on("POST", `${AUTH_PREFIX}/devices/register`, { body: {} });
    await expect(newClient().addDevice()).rejects.toThrow(/publicKey/);
  });

  it("revokeSession without a credential id looks it up via GET /sessions first", async () => {
    seedSession(storage, { access: ACCESS });
    server.on("GET", `${AUTH_PREFIX}/sessions`, {
      body: [{ id: "s_1", credential_id: "cred_1" }],
    });
    server.on("DELETE", `${AUTH_PREFIX}/sessions/s_1`, { status: 200, body: {} });
    storage.seed(KEYS.cred, JSON.stringify({ user_1: ["cred_1", "cred_2"] }));

    await newClient().revokeSession("s_1");
    expect(server.calls.map((c) => `${c.method} ${c.path}`)).toContain(`GET ${AUTH_PREFIX}/sessions`);
    expect(JSON.parse(storage.map.get(KEYS.cred)!)).toEqual({ user_1: ["cred_2"] });
  });

  it("getMfaStatus(identifier) is unauthenticated and URL-encodes the identifier", async () => {
    seedSession(storage, { access: ACCESS });
    await newClient().getMfaStatus("ada+1@example.com");
    const [call] = server.callsTo("GET", `${AUTH_PREFIX}/mfa/status`);
    expect(call.url).toBe(`${BASE_URL}${AUTH_PREFIX}/mfa/status?identifier=ada%2B1%40example.com`);
    expect(call.headers["x-authorization"]).toBeUndefined();
  });
});

describe("unauthenticated endpoint table", () => {
  type Row = {
    name: string;
    invoke: (c: ScuteClient) => Promise<unknown>;
    method: string;
    path: string;
    body: unknown;
  };
  const rows: Row[] = [
    { name: "sendLoginMagicLink", invoke: (c) => c.sendLoginMagicLink("ada@example.com"), method: "POST", path: "/magic_links/login", body: { identifier: "ada@example.com", webauthn_enabled: false } },
    { name: "sendRegisterMagicLink", invoke: (c) => c.sendRegisterMagicLink("ada@example.com", { name: "Ada" } as any), method: "POST", path: "/magic_links/register", body: { identifier: "ada@example.com", user_meta: { name: "Ada" }, webauthn_enabled: false } },
    { name: "sendLoginOtp", invoke: (c) => c.sendLoginOtp("+15550001111"), method: "POST", path: "/otps/login", body: { identifier: "+15550001111", webauthn_enabled: false } },
    // register OTP goes to /otps/login too; only user_meta differs
    { name: "sendRegisterOtp", invoke: (c) => c.sendRegisterOtp("+15550001111", { name: "Ada" } as any), method: "POST", path: "/otps/login", body: { identifier: "+15550001111", user_meta: { name: "Ada" }, webauthn_enabled: false } },
    { name: "getMagicLinkStatus", invoke: (c) => c.getMagicLinkStatus("ml_1"), method: "POST", path: "/magic_links/status", body: { id: "ml_1" } },
    { name: "confirmInvite", invoke: (c) => c.confirmInvite("inv_tok", { name: "Ada" } as any), method: "POST", path: "/magic_links/confirm_invite", body: { token: "inv_tok", user_meta: { name: "Ada" } } },
    { name: "getChallengeStatus", invoke: (c) => c.getChallengeStatus("ch_1"), method: "GET", path: "/challenges/ch_1", body: undefined },
    { name: "resendChallenge", invoke: (c) => c.resendChallenge("ch_1"), method: "POST", path: "/challenges/ch_1/resend", body: {} },
    { name: "cancelChallenge", invoke: (c) => c.cancelChallenge("ch_1"), method: "DELETE", path: "/challenges/ch_1", body: undefined },
    { name: "startMsAuthenticatorLogin", invoke: (c) => c.startMsAuthenticatorLogin("ada@example.com"), method: "POST", path: "/challenges", body: { purpose: "authenticate", method: "entra_push", identifier: "ada@example.com" } },
    { name: "webauthnInitializeLogin", invoke: (c) => c.webauthnInitializeLogin("ada@example.com"), method: "POST", path: "/webauthn/login/initialize", body: { identifier: "ada@example.com" } },
    { name: "getUserMetafieldState", invoke: (c) => c.getUserMetafieldState("user_1"), method: "GET", path: "/users/metafields", body: undefined },
  ];

  it.each(rows)("$name -> $method $path", async ({ invoke, method, path, body }) => {
    server.on(method, `${AUTH_PREFIX}${path}`, { status: 200, body: {} });
    const client = newClient();
    await ready(client);

    await invoke(client);

    const calls = server.callsTo(method, `${AUTH_PREFIX}${path}`);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual(body);
    expect(calls[0].headers["x-authorization"]).toBeUndefined();
    expect(calls[0].credentials).toBe("include");
  });

  it("admin lookups: users?identifier is encoded, app data is under /v1/apps", async () => {
    const client = newClient();
    await ready(client);
    await client.admin.getUserByIdentifier("ada+1@example.com");
    const lookup = server.calls.find((c) => c.path === `${AUTH_PREFIX}/users`)!;
    expect(lookup.url).toBe(`${BASE_URL}${AUTH_PREFIX}/users?identifier=ada%2B1%40example.com`);
    expect(server.calls[0].url).toBe(`${BASE_URL}/v1/apps/${APP_ID}`);
  });
});

describe("pre-auth events", () => {
  it.each([
    { name: "sendLoginMagicLink", event: AUTH_CHANGE_EVENTS.MAGIC_PENDING, path: "/magic_links/login", invoke: (c: ScuteClient) => c.sendLoginMagicLink("a@b.co") },
    { name: "sendRegisterMagicLink", event: AUTH_CHANGE_EVENTS.MAGIC_PENDING, path: "/magic_links/register", invoke: (c: ScuteClient) => c.sendRegisterMagicLink("a@b.co") },
    { name: "sendLoginOtp", event: AUTH_CHANGE_EVENTS.OTP_PENDING, path: "/otps/login", invoke: (c: ScuteClient) => c.sendLoginOtp("a@b.co") },
    { name: "sendRegisterOtp", event: AUTH_CHANGE_EVENTS.OTP_PENDING, path: "/otps/login", invoke: (c: ScuteClient) => c.sendRegisterOtp("a@b.co") },
  ])("$name emits $event on success and nothing on failure", async ({ path, invoke, event }) => {
    const client = newClient();
    const rec = recordEvents(client);

    server.on("POST", `${AUTH_PREFIX}${path}`, { body: { id: "x" } });
    const ok = await invoke(client);
    expect(ok).toEqual({ data: { id: "x" }, error: null });
    expect(rec.names()).toEqual([event]);

    server.on("POST", `${AUTH_PREFIX}${path}`, { status: 422, body: { error: "bad" } });
    const bad = await invoke(client);
    expect(bad.data).toBeNull();
    expect(rec.names()).toEqual([event]);
  });

  it("emitEvent = false suppresses the pending event", async () => {
    server.on("POST", `${AUTH_PREFIX}/magic_links/login`, { body: {} });
    const client = newClient();
    const rec = recordEvents(client);
    await client.sendLoginMagicLink("a@b.co", undefined, false);
    expect(rec.names()).toEqual([]);
  });

  it("an explicit webauthnEnabled flag is sent as-is", async () => {
    server.on("POST", `${AUTH_PREFIX}/magic_links/login`, { body: {} });
    await newClient().sendLoginMagicLink("a@b.co", true);
    expect(server.callsTo("POST", `${AUTH_PREFIX}/magic_links/login`)[0].body.webauthn_enabled).toBe(true);
  });
});

describe("sign in / sign up routing", () => {
  const USERS = `${AUTH_PREFIX}/users`;
  const lookup = (user: unknown) => server.on("GET", USERS, { body: { user } });
  const sent = () =>
    server.calls
      .filter((c) => c.method === "POST")
      .map((c) => c.path.replace(AUTH_PREFIX, ""));

  beforeEach(() => {
    for (const p of ["/magic_links/login", "/magic_links/register", "/otps/login"]) {
      server.on("POST", `${AUTH_PREFIX}${p}`, { body: { id: p } });
    }
  });

  it("signIn: unknown identifier -> IdentifierNotRecognizedError, nothing sent", async () => {
    lookup(null);
    const { data, error } = await newClient().signIn("ada@example.com");
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(IdentifierNotRecognizedError);
    expect(sent()).toEqual([]);
  });

  it("signIn: a failing lookup is reported as TechnicalError", async () => {
    server.on("GET", USERS, { status: 500, body: {} });
    const { error } = await newClient().signIn("ada@example.com");
    expect(error).toBeInstanceOf(TechnicalError);
  });

  it("signIn: email on a magic-link app -> login magic link", async () => {
    lookup(userFixture());
    const client = newClient();
    await ready(client);
    expect(await client.signIn("ada@example.com")).toEqual({
      data: { id: "/magic_links/login" },
      error: null,
    });
    expect(sent()).toEqual(["/magic_links/login"]);
  });

  it("signIn: phone-looking identifier -> login OTP", async () => {
    lookup(userFixture({ phone: "+15550001111" }));
    const client = newClient();
    await ready(client);
    await client.signIn("+1 555 000 1111");
    expect(sent()).toEqual(["/otps/login"]);
  });

  it("signIn: email on an OTP app -> login OTP", async () => {
    server.on("GET", `/v1/apps/${APP_ID}`, { body: appDataFixture({ email_auth_type: "otp" }) });
    lookup(userFixture());
    const client = newClient();
    await ready(client);
    await client.signIn("ada@example.com");
    expect(sent()).toEqual(["/otps/login"]);
  });

  // Known limitation, tracked separately: signIn does not load app data
  // itself, so it rejects with a TypeError when app data failed to load.
  it("signIn rejects with a TypeError when app data failed to load", async () => {
    server.on("GET", `/v1/apps/${APP_ID}`, { status: 500, body: {} });
    lookup(userFixture());
    const client = newClient();
    await ready(client);
    await expect(client.signIn("ada@example.com")).rejects.toThrow(TypeError);
  });

  it("signUp: an existing verified identifier -> IdentifierAlreadyExistsError", async () => {
    lookup(userFixture({ email_verified: true }));
    const { error } = await newClient().signUp("ada@example.com");
    expect(error).toBeInstanceOf(IdentifierAlreadyExistsError);
    expect(sent()).toEqual([]);
  });

  it("signUp: an existing but unverified identifier is allowed to register again", async () => {
    lookup(userFixture({ email_verified: false, phone_verified: false }));
    await newClient().signUp("ada@example.com", { userMeta: { name: "Ada" } as any });
    expect(sent()).toEqual(["/magic_links/register"]);
    expect(server.callsTo("POST", `${AUTH_PREFIX}/magic_links/register`)[0].body.user_meta).toEqual({
      name: "Ada",
    });
  });

  it("signInOrUp: new identifier registers, known identifier logs in", async () => {
    lookup(null);
    const client = newClient();
    await client.signInOrUp("new@example.com");
    lookup(userFixture());
    await client.signInOrUp("ada@example.com");
    expect(sent()).toEqual(["/magic_links/register", "/magic_links/login"]);
  });

  it("identifierExists returns the user or null, and throws TechnicalError on lookup failure", async () => {
    const client = newClient();
    lookup(userFixture());
    expect(await client.identifierExists("ada@example.com")).toEqual(userFixture());
    lookup(null);
    expect(await client.identifierExists("x@example.com")).toBeNull();
    server.on("GET", USERS, { status: 500, body: {} });
    await expect(client.identifierExists("x@example.com")).rejects.toBeInstanceOf(TechnicalError);
  });
});

describe("fingerprinting (browser)", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("adds X-Fingerprint to non-GET client requests only, once the agent has loaded", async () => {
    installBrowser();
    server.on("POST", `${AUTH_PREFIX}/magic_links/login`, { body: {} });
    const client = createClient({
      appId: APP_ID,
      baseUrl: BASE_URL,
      preferences: { refetchInverval: 0 },
    });
    await ready(client);
    await new Promise((r) => setTimeout(r, 20));

    await client.sendLoginMagicLink("ada@example.com");
    await client.getUserMetafieldState("user_1");
    await client.admin.getUserByIdentifier("ada@example.com");

    expect(server.callsTo("POST", `${AUTH_PREFIX}/magic_links/login`)[0].headers["x-fingerprint"]).toBe(
      "fp_visitor_1"
    );
    expect(server.callsTo("GET", `${AUTH_PREFIX}/users/metafields`)[0].headers["x-fingerprint"]).toBeUndefined();
    // admin requests go through a separate wretch instance: never fingerprinted
    expect(server.callsTo("GET", `${AUTH_PREFIX}/users`)[0].headers["x-fingerprint"]).toBeUndefined();
  });

  it("fingerprinting: false never adds the header", async () => {
    installBrowser();
    server.on("POST", `${AUTH_PREFIX}/magic_links/login`, { body: {} });
    const client = createClient({ appId: APP_ID, baseUrl: BASE_URL, preferences: quietPreferences });
    await ready(client);
    await new Promise((r) => setTimeout(r, 20));
    await client.sendLoginMagicLink("ada@example.com");
    expect(server.callsTo("POST", `${AUTH_PREFIX}/magic_links/login`)[0].headers["x-fingerprint"]).toBeUndefined();
  });
});

describe("browser initialization side effects", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("registers a visibilitychange listener and opens the app-scoped channel", async () => {
    const { win } = installBrowser();
    const client = createClient({ appId: APP_ID, baseUrl: BASE_URL, preferences: quietPreferences });
    await ready(client);
    expect(win.addEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(FakeBroadcastChannel.instances.map((c) => c.name)).toContain(`sct_broadcast__${APP_ID}`);
  });

  it("registers the refetch interval with refetchInverval seconds", async () => {
    installBrowser();
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const client = createClient({
      appId: APP_ID,
      baseUrl: BASE_URL,
      preferences: { fingerprinting: false, refetchInverval: 123 },
    });
    await ready(client);
    const delays = setIntervalSpy.mock.calls.map((call) => call[1]);
    expect(delays).toContain(123_000);
    for (const call of setIntervalSpy.mock.results) clearInterval(call.value as any);
  });
});
