/**
 * RB-49: signing in as a user. The admin API starts and ends sessions; the
 * client switches the browser to one and back to the support person's own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../ScuteClient";
import ScuteAdminApi from "../ScuteAdminApi";
import { AUTH_CHANGE_EVENTS } from "../lib/constants";
import { decodeImpersonation, impersonationContext } from "../lib/helpers";
import {
  accessToken,
  APP_ID,
  AUTH_PREFIX,
  BASE_URL,
  createServer,
  KEYS,
  MemoryAdapter,
  quietPreferences,
  recordEvents,
  refreshToken,
  seedSession,
  userFixture,
  type TestServer,
} from "./harness";

const CURRENT_USER = `${AUTH_PREFIX}/current_user`;
const IMPERSONATOR_KEY = `sct_impersonator__${APP_ID}`;
const actor = { kind: "backend" as const, sub: "support@acme.test", email: "support@acme.test" };

let server: TestServer;
let storage: MemoryAdapter;

beforeEach(() => {
  server = createServer();
  server.on("GET", CURRENT_USER, { body: { user: userFixture() } });
  server.on("DELETE", CURRENT_USER, { status: 200, body: {} });
  storage = new MemoryAdapter();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const newClient = () =>
  createClient({
    appId: APP_ID,
    baseUrl: BASE_URL,
    preferences: { ...quietPreferences, sessionStorageAdapter: storage as any },
  } as any);

const impersonationTokens = (expiresIn = 1800) => ({
  access: accessToken({ uuid: "user_2", imp: true, act: actor, expiresIn }),
  access_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  session_id: "ses_1",
  user_id: "user_2",
  impersonation: { actor, reason: "Ticket 4411", started_at: "", expires_at: "" },
});

describe("reading the token", () => {
  it("names the real actor only on a session as the user", () => {
    const token = impersonationTokens().access;
    expect(decodeImpersonation(token)).toEqual({ actor, expiresAt: expect.any(Date) });
    expect(decodeImpersonation(accessToken())).toBeNull();
    expect(decodeImpersonation("not.a.jwt")).toBeNull();
    expect(decodeImpersonation(null)).toBeNull();
  });

  it("builds the check context from verified claims", () => {
    expect(impersonationContext({ imp: true, act: actor })).toEqual({ impersonated: true, actor });
    expect(impersonationContext({ imp: "true" })).toEqual({});
    expect(impersonationContext(null)).toEqual({});
  });
});

describe("admin API", () => {
  const admin = () => new ScuteAdminApi({ appId: APP_ID, baseUrl: BASE_URL, secretKey: "sk_test" });
  const base = `/v1/apps/${APP_ID}/users/user_2`;

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("starts a session as the user with the secret key", async () => {
    server.on("POST", `${base}/impersonate`, { status: 201, body: impersonationTokens() });

    const { data, error } = await admin().impersonateUser("user_2", { reason: "Ticket 4411", actorUserId: "user_9", minutes: 15 });

    expect(error).toBeNull();
    expect(data?.session_id).toBe("ses_1");
    const [call] = server.callsTo("POST", `${base}/impersonate`);
    expect(call.headers["authorization"]).toBe("Bearer sk_test");
    expect(call.body).toEqual({ reason: "Ticket 4411", minutes: 15, actor_user_id: "user_9" });
  });

  it("lists and ends them", async () => {
    server.on("GET", `${base}/impersonations`, { body: { impersonations: [{ session_id: "ses_1", actor, reason: "x" }] } });
    server.on("DELETE", `${base}/impersonate`, { status: 200, body: { ended: 1 } });

    const { data } = await admin().listImpersonations("user_2");
    expect(data?.[0].session_id).toBe("ses_1");

    const { error } = await admin().stopImpersonating("user_2", "ses_1");
    expect(error).toBeNull();
    expect(server.callsTo("DELETE", `${base}/impersonate`)[0].query.get("session_id")).toBe("ses_1");
  });
});

describe("in the browser", () => {
  it("switches to the session as the user, keeping the support person's own aside", async () => {
    const own = { access: accessToken({ uuid: "user_9" }), refresh: refreshToken() };
    seedSession(storage, own);
    const client = newClient();
    const rec = recordEvents(client);
    const tokens = impersonationTokens();

    const { error } = await client.beginImpersonation(tokens);

    expect(error).toBeNull();
    expect(storage.map.get(KEYS.access)).toBe(tokens.access);
    expect(storage.map.has(KEYS.refresh)).toBe(false); // never refreshed
    expect(JSON.parse(storage.map.get(IMPERSONATOR_KEY)!)).toEqual(own);
    expect(await client.getImpersonation()).toMatchObject({ actor });
    expect(rec.names()).toContain(AUTH_CHANGE_EVENTS.SIGNED_IN);
  });

  it("refuses tokens that aren't a session as the user", async () => {
    const client = newClient();
    const { error } = await client.beginImpersonation({ ...impersonationTokens(), access: accessToken() });

    expect(error).toBeTruthy();
    expect(storage.map.has(KEYS.access)).toBe(false);
  });

  it("stops: ends it on the server and brings the own session back", async () => {
    const own = { access: accessToken({ uuid: "user_9" }), refresh: refreshToken() };
    seedSession(storage, own);
    const client = newClient();
    const tokens = impersonationTokens();
    await client.beginImpersonation(tokens);
    const rec = recordEvents(client);

    expect(await client.stopImpersonating()).toBe(true);

    const [call] = server.callsTo("DELETE", CURRENT_USER);
    expect(call.headers["x-authorization"]).toBe(tokens.access);
    expect(storage.map.get(KEYS.access)).toBe(own.access);
    expect(storage.map.get(KEYS.refresh)).toBe(own.refresh);
    expect(storage.map.has(IMPERSONATOR_KEY)).toBe(false);
    expect(await client.getImpersonation()).toBeNull();
    expect(rec.names()).toContain(AUTH_CHANGE_EVENTS.SIGNED_IN);
  });

  it("stops without an own session: signed out", async () => {
    const client = newClient();
    await client.beginImpersonation(impersonationTokens());
    const rec = recordEvents(client);

    expect(await client.stopImpersonating()).toBe(true);

    expect(storage.map.has(KEYS.access)).toBe(false);
    expect(rec.names()).toContain(AUTH_CHANGE_EVENTS.SIGNED_OUT);
  });

  it("has nothing to stop in a normal session", async () => {
    seedSession(storage, { access: accessToken(), refresh: refreshToken() });
    const client = newClient();

    expect(await client.stopImpersonating()).toBe(false);
    expect(server.callsTo("DELETE", CURRENT_USER)).toHaveLength(0);
  });
});

describe("hand-off to the app (sign in as this user from the dashboard)", () => {
  const EXCHANGE = `${AUTH_PREFIX}/impersonation/exchange`;

  it("the admin API asks for a one-time link instead of the token", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const base = `/v1/apps/${APP_ID}/users/user_2`;
    const answer = {
      session_id: "ses_1",
      impersonation: { actor, reason: "Ticket 4411", started_at: "", expires_at: "" },
      handoff: { code: "c0de", url: "https://app.test/login?sct_imp=c0de", expires_at: "" },
    };
    server.on("POST", `${base}/impersonate`, { status: 201, body: answer });
    const admin = new ScuteAdminApi({ appId: APP_ID, baseUrl: BASE_URL, secretKey: "sk_test" });

    const { data, error } = await admin.createImpersonationHandoff("user_2", { reason: "Ticket 4411", actor: { email: "support@acme.test" } });

    expect(error).toBeNull();
    expect(data?.handoff.url).toBe("https://app.test/login?sct_imp=c0de");
    expect(server.callsTo("POST", `${base}/impersonate`)[0].body).toEqual({
      reason: "Ticket 4411",
      actor: { email: "support@acme.test" },
      handoff: true,
    });
  });

  it("reads the code from the link", () => {
    const client = newClient();
    expect(client.getImpersonationHandoffCode("https://app.test/login?sct_imp=c0de&next=%2F")).toBe("c0de");
    expect(client.getImpersonationHandoffCode("https://app.test/login")).toBeNull();
  });

  it("swaps the code for the session as the user and switches to it, keeping the own session aside", async () => {
    const own = { access: accessToken({ uuid: "user_9" }), refresh: refreshToken() };
    seedSession(storage, own);
    const tokens = impersonationTokens();
    server.on("POST", EXCHANGE, { body: tokens });
    const client = newClient();
    const rec = recordEvents(client);

    const { error } = await client.signInWithImpersonationHandoff("c0de");

    expect(error).toBeNull();
    expect(server.callsTo("POST", EXCHANGE)[0].body).toEqual({ code: "c0de" });
    expect(storage.map.get(KEYS.access)).toBe(tokens.access);
    expect(storage.map.has(KEYS.refresh)).toBe(false);
    expect(JSON.parse(storage.map.get(IMPERSONATOR_KEY)!)).toEqual(own);
    expect(await client.getImpersonation()).toMatchObject({ actor });
    expect(rec.names()).toContain(AUTH_CHANGE_EVENTS.SIGNED_IN);
  });

  it("leaves the session alone when the code was used or ran out", async () => {
    const own = { access: accessToken({ uuid: "user_9" }), refresh: refreshToken() };
    seedSession(storage, own);
    server.on("POST", EXCHANGE, {
      status: 422,
      body: { error: "This sign-in link was used or has run out. Start a new one.", error_code: "handoff_invalid" },
    });
    const client = newClient();

    const { error } = await client.signInWithImpersonationHandoff("used");

    expect(error).toBeTruthy();
    expect(storage.map.get(KEYS.access)).toBe(own.access);
    expect(storage.map.has(IMPERSONATOR_KEY)).toBe(false);
  });

  it("refuses an answer that isn't a session as the user", async () => {
    server.on("POST", EXCHANGE, { body: { ...impersonationTokens(), access: accessToken() } });
    const client = newClient();

    const { error } = await client.signInWithImpersonationHandoff("c0de");

    expect(error).toBeTruthy();
    expect(storage.map.has(KEYS.access)).toBe(false);
  });

  it("has nothing to swap without a code", async () => {
    const { error } = await newClient().signInWithImpersonationHandoff(null);

    expect(error).toBeTruthy();
    expect(server.callsTo("POST", EXCHANGE)).toHaveLength(0);
  });
});
