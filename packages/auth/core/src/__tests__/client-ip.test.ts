/**
 * The signing-in person's address (X-Scute-Client-IP) on calls made with the
 * secret key, so sign-ins a server starts are checked against IP rules.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScuteAdminApi from "../ScuteAdminApi";
import ScuteClient from "../ScuteClient";
import { isClientIp, normalizeClientIp, SCUTE_CLIENT_IP_HEADER } from "../lib/clientIp";
import { APP_ID, BASE_URL, createServer, type TestServer } from "./harness";

let server: TestServer;

beforeEach(() => {
  server = createServer({ appData: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const USERS = `/v1/auth/${APP_ID}/users`;
const header = SCUTE_CLIENT_IP_HEADER.toLowerCase();

const admin = (config: { secretKey?: string; clientIp?: string | null } = {}) =>
  new ScuteAdminApi({ appId: APP_ID, baseUrl: BASE_URL, secretKey: "sk_test", ...config });

const sentIp = (method: string, path: string, index = 0) =>
  server.callsTo(method, path)[index].headers[header];

describe("isClientIp", () => {
  it.each([
    "203.0.113.24",
    "0.0.0.0",
    "255.255.255.255",
    "2001:db8::1",
    "::1",
    "::",
    "2001:0db8:0000:0000:0000:ff00:0042:8329",
    "::ffff:203.0.113.24",
    "64:ff9b::198.51.100.7",
    "fe80::1:2:3:4:5:6",
  ])("takes %s", (ip) => {
    expect(isClientIp(ip)).toBe(true);
  });

  it.each([
    "",
    "203.0.113.256",
    "203.0.113",
    "01.2.3.4",
    "203.0.113.0/24",
    "2001:db8::/32",
    "203.0.113.24, 198.51.100.7",
    "203.0.113.24:443",
    "2001:db8::1::2",
    "1:2:3:4:5:6:7:8:9",
    "1:2:3:4:5:6:7",
    "::ffff:203.0.113.999",
    "gggg::1",
    "unknown",
  ])("refuses %j", (value) => {
    expect(isClientIp(value)).toBe(false);
  });

  it("normalizes by trimming, and drops what isn't one address", () => {
    expect(normalizeClientIp(" 203.0.113.24 ")).toBe("203.0.113.24");
    expect(normalizeClientIp("203.0.113.24, 10.0.0.1")).toBeUndefined();
    expect(normalizeClientIp(undefined)).toBeUndefined();
    expect(normalizeClientIp(42)).toBeUndefined();
  });
});

describe("admin: the person's address", () => {
  it("is sent on every secret key call when the client has one", async () => {
    server.on("POST", USERS, { body: { user: { id: "user_1" } } });
    server.on("GET", `/v1/${APP_ID}/users/user_1`, { body: { user: null } });
    server.on("GET", USERS, { body: { user: null } });

    const api = admin({ clientIp: "203.0.113.24" });
    await api.createUser("ada@example.com");
    await api.getUser("user_1");
    // Uses only the default headers: a lookup that can sign the person up.
    await api.getUserByIdentifier("ada@example.com");

    expect(sentIp("POST", USERS)).toBe("203.0.113.24");
    expect(sentIp("GET", `/v1/${APP_ID}/users/user_1`)).toBe("203.0.113.24");
    expect(sentIp("GET", USERS)).toBe("203.0.113.24");
  });

  it("is not sent when there is none", async () => {
    server.on("POST", USERS, { body: { user: { id: "user_1" } } });

    await admin().createUser("ada@example.com");

    expect(sentIp("POST", USERS)).toBeUndefined();
    expect(server.callsTo("POST", USERS)[0].headers["authorization"]).toBe("Bearer sk_test");
  });

  it("is never sent without the secret key (Scute only reads it on server calls)", async () => {
    server.on("GET", USERS, { body: { user: null } });

    await new ScuteAdminApi({ appId: APP_ID, baseUrl: BASE_URL, clientIp: "203.0.113.24" }).getUserByIdentifier("ada@example.com");

    expect(sentIp("GET", USERS)).toBeUndefined();
  });

  it("withClientIp scopes one per request and leaves the client as it was", async () => {
    server.on("POST", `/v1/auth/${APP_ID}/challenges`, { body: { challenge: { token: "t" } } });
    server.on("POST", USERS, { body: { user: { id: "user_1" } } });
    server.on("GET", USERS, { body: { user: null } });

    const api = admin({ clientIp: "198.51.100.7" });
    await api.withClientIp("2001:db8::1").authzStartStepUp({ userId: "user_1", permission: "invoices.pay", method: "email_otp" });
    await api.withClientIp("203.0.113.24").getUserByIdentifier("ada@example.com");
    await api.createUser("ada@example.com");

    expect(sentIp("POST", `/v1/auth/${APP_ID}/challenges`)).toBe("2001:db8::1");
    expect(sentIp("GET", USERS)).toBe("203.0.113.24");
    expect(sentIp("POST", USERS)).toBe("198.51.100.7");
  });

  it("withClientIp(null) keeps the client's own", async () => {
    server.on("POST", USERS, { body: { user: { id: "user_1" } } });

    const api = admin({ clientIp: "198.51.100.7" });
    expect(api.withClientIp(null)).toBe(api);
    await api.withClientIp(undefined).createUser("ada@example.com");

    expect(sentIp("POST", USERS)).toBe("198.51.100.7");
  });

  it("throws for a value that isn't one address, which Scute would refuse", () => {
    expect(() => admin().withClientIp("203.0.113.24, 10.0.0.1")).toThrow(/one IP address/);
    expect(() => admin().withClientIp("203.0.113.0/24")).toThrow(/one IP address/);
    expect(() => admin({ clientIp: "nope" })).toThrow(/one IP address/);
  });

  it("is passed through from ScuteClient's config", async () => {
    server.on("POST", USERS, { body: { user: { id: "user_1" } } });

    const client = new ScuteClient({
      appId: APP_ID,
      baseUrl: BASE_URL,
      secretKey: "sk_test",
      clientIp: "203.0.113.24",
      preferences: { persistSession: false, autoRefreshToken: false, refetchOnWindowFocus: false },
    });
    await client.admin.createUser("ada@example.com");

    expect(sentIp("POST", USERS)).toBe("203.0.113.24");
  });
});
