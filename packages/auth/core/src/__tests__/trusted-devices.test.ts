/**
 * "Trust this device": on the MFA step (verifyMfaChallenge's trustDevice) and
 * the signed-in person's own devices (list, trust this one, untrust).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../ScuteClient";
import { BaseHttpError, InvalidAuthTokenError } from "../lib/errors";
import {
  accessToken,
  APP_ID,
  AUTH_PREFIX,
  BASE_URL,
  createServer,
  KEYS,
  MemoryAdapter,
  quietPreferences,
  refreshToken,
  seedSession,
  userFixture,
  type TestServer,
} from "./harness";

const TRUSTED = `${AUTH_PREFIX}/trusted_devices`;
const VERIFY = `${AUTH_PREFIX}/challenges/ch_tok/verify`;

let server: TestServer;
let storage: MemoryAdapter;

const device = (overrides: Record<string, unknown> = {}) => ({
  id: "dev_1",
  label: "Chrome on macOS",
  city: "Berlin",
  country_code: "DE",
  first_seen_at: "2026-10-01T10:00:00Z",
  last_seen_at: "2026-10-30T10:00:00Z",
  trusted: true,
  trusted_at: "2026-10-30T10:00:00Z",
  trust_expires_at: "2026-11-29T10:00:00Z",
  current: true,
  ...overrides,
});

const newClient = () =>
  createClient({
    appId: APP_ID,
    baseUrl: BASE_URL,
    preferences: { ...quietPreferences, sessionStorageAdapter: storage as any },
  } as any);

beforeEach(() => {
  server = createServer();
  server.on("GET", `${AUTH_PREFIX}/current_user`, { body: { user: userFixture() } });
  storage = new MemoryAdapter();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("on the MFA step", () => {
  it("asks to trust the device and says whether it is trusted now", async () => {
    const pair = { access: accessToken(), refresh: refreshToken() };
    server.on("POST", VERIFY, { body: { ...pair, device_trusted: true } });
    const client = newClient();

    expect(await client.verifyMfaChallenge("ch_tok", "123456", { trustDevice: true })).toEqual({
      error: null,
      deviceTrusted: true,
    });
    expect(server.callsTo("POST", VERIFY)[0].body).toEqual({ code: "123456", trust_device: true });
    expect(storage.map.get(KEYS.access)).toBe(pair.access);
  });

  it("says so when the API didn't trust it (the app doesn't allow it, or no device fingerprint)", async () => {
    server.on("POST", VERIFY, { body: { access: accessToken(), refresh: refreshToken(), device_trusted: false } });

    expect(await newClient().verifyMfaChallenge("ch_tok", "123456", { trustDevice: true })).toEqual({
      error: null,
      deviceTrusted: false,
    });
  });

  it("sends an unticked box as false", async () => {
    server.on("POST", VERIFY, { body: { access: accessToken(), refresh: refreshToken(), device_trusted: false } });

    await newClient().verifyMfaChallenge("ch_tok", "123456", { trustDevice: false });
    expect(server.callsTo("POST", VERIFY)[0].body).toEqual({ code: "123456", trust_device: false });
  });

  it("sends nothing about trust without the option, as before", async () => {
    server.on("POST", VERIFY, { body: { access: accessToken(), refresh: refreshToken() } });

    expect(await newClient().verifyMfaChallenge("ch_tok", "123456")).toEqual({ error: null });
    expect(server.callsTo("POST", VERIFY)[0].body).toEqual({ code: "123456" });
  });
});

describe("the person's devices", () => {
  beforeEach(() => {
    seedSession(storage, { access: accessToken(), refresh: refreshToken() });
  });

  it("lists them with the current one and whether it can be trusted", async () => {
    const body = {
      devices: [device()],
      current_device: { id: "dev_1", trusted: true, can_trust: true, reason: null },
      device_trust: { enabled: true, days: 30 },
    };
    server.on("GET", TRUSTED, { body });
    const client = newClient();

    const { data, error } = await client.listTrustedDevices();

    expect(error).toBeNull();
    expect(data).toEqual(body);
    expect(server.callsTo("GET", TRUSTED)[0].headers["x-authorization"]).toBe(storage.map.get(KEYS.access));
  });

  it("trusts this one", async () => {
    server.on("POST", TRUSTED, { status: 201, body: { device: device() } });

    const { data, error } = await newClient().trustThisDevice();

    expect(error).toBeNull();
    expect(data).toMatchObject({ id: "dev_1", trusted: true });
  });

  it("passes on a refusal (the sign-in didn't pass MFA)", async () => {
    server.on("POST", TRUSTED, {
      status: 403,
      body: { error: "Sign in with your second factor on this device to trust it", error_code: "second_factor_required" },
    });

    const { data, error } = await newClient().trustThisDevice();

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(BaseHttpError);
    expect((error as BaseHttpError).code).toBe(403);
  });

  it("untrusts one", async () => {
    server.on("DELETE", `${TRUSTED}/dev_1`, { status: 200, body: { device: device({ trusted: false }) } });

    const { error } = await newClient().untrustDevice("dev_1");

    expect(error).toBeNull();
    expect(server.callsTo("DELETE", `${TRUSTED}/dev_1`)).toHaveLength(1);
  });
});

it("needs a signed-in person", async () => {
  const client = newClient();

  const { data, error } = await client.listTrustedDevices();

  expect(data).toBeNull();
  expect(error).toBeInstanceOf(InvalidAuthTokenError);
  expect(server.callsTo("GET", TRUSTED)).toHaveLength(0);
});
