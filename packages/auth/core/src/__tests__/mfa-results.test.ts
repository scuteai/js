/**
 * Pins the exact result shapes of the three sign-in entry points that can
 * stop at an MFA gate (verifyMagicLinkToken, verifyOtp and the WebAuthn
 * path behind signIn / signInWithVerifyDevice), plus the follow-up MFA
 * helpers (verifyMfaChallenge, switchMfaMethod) and the passkey gating in
 * signIn. The WebAuthn browser API is mocked at src/lib/webauthn.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const webauthnMock = vi.hoisted(() => ({
  get: vi.fn(),
  create: vi.fn(),
  supported: vi.fn(() => true),
}));
vi.mock("../lib/webauthn", () => ({
  default: webauthnMock,
  get: webauthnMock.get,
  create: webauthnMock.create,
  supported: webauthnMock.supported,
}));

import { createClient } from "../ScuteClient";
import { AUTH_CHANGE_EVENTS } from "../lib/constants";
import {
  BaseHttpError,
  IdentifierNotRecognizedError,
  InvalidMagicLinkError,
  UnknownSignInError,
  WebAuthnError,
} from "../lib/errors";
import {
  accessToken,
  APP_ID,
  appDataFixture,
  AUTH_PREFIX,
  BASE_URL,
  createServer,
  FakeLocalStorage,
  installBrowser,
  KEYS,
  magicLinkToken,
  quietPreferences,
  ready,
  recordEvents,
  refreshToken,
  userFixture,
  type TestServer,
} from "./harness";

const CHALLENGE = {
  token: "ch_tok",
  status: "pending",
  purpose: "mfa",
  method: "totp",
  expires_at: "2030-01-01T00:00:00Z",
};

const mfaPayload = (overrides: Record<string, unknown> = {}) => ({
  mfa_required: true,
  app_user_id: "au_1",
  available_methods: ["totp", "email_otp"],
  mfa_challenge: CHALLENGE,
  ...overrides,
});

/** What every MFA gate returns today for mfaPayload(). */
const EXPECTED_MFA_RESULT = {
  mfaRequired: true,
  mfaEnrollmentRequired: false,
  mfaGracePeriod: false,
  mfaGraceDaysRemaining: undefined,
  mfaChallenge: CHALLENGE,
  availableMethods: ["totp", "email_otp"],
};

const CURRENT_USER = `${AUTH_PREFIX}/current_user`;
const AUTHENTICATE = `${AUTH_PREFIX}/magic_links/authenticate`;
const USERS = `${AUTH_PREFIX}/users`;
const WEBAUTHN_INIT = `${AUTH_PREFIX}/webauthn/login/initialize`;
const WEBAUTHN_FINALIZE = `${AUTH_PREFIX}/webauthn/login/finalize`;

let server: TestServer;
let localStorage: FakeLocalStorage;

const setup = async ({
  href = "https://app.test/callback",
  appData = appDataFixture(),
}: { href?: string; appData?: Record<string, unknown> } = {}) => {
  ({ localStorage } = installBrowser({ href }));
  server = createServer({ appData });
  server.on("GET", CURRENT_USER, { body: { user: userFixture() } });
  const client = createClient({
    appId: APP_ID,
    baseUrl: BASE_URL,
    preferences: { ...quietPreferences },
  });
  await ready(client);
  return { client, rec: recordEvents(client) };
};

const tokenPair = () => ({ access: accessToken(), refresh: refreshToken() });

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  webauthnMock.get.mockReset();
  webauthnMock.create.mockReset();
  webauthnMock.supported.mockReset().mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verifyMagicLinkToken", () => {
  it("returns the camelCase MFA result, stores the raw challenge and emits MFA_REQUIRED", async () => {
    const { client, rec } = await setup();
    server.on("PATCH", AUTHENTICATE, { body: mfaPayload() });
    const token = magicLinkToken();

    const result = await client.verifyMagicLinkToken(token);

    expect(result).toStrictEqual({ data: EXPECTED_MFA_RESULT, error: null });
    expect(client.pendingMfaChallenge).toEqual(mfaPayload());
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.MFA_REQUIRED]);
    expect(server.callsTo("PATCH", AUTHENTICATE)[0].body).toEqual({ token });
    expect(localStorage.getItem(KEYS.access)).toBeNull();
  });

  it("maps enrollment and grace fields and emits MFA_ENROLLMENT_REQUIRED instead", async () => {
    const { client, rec } = await setup();
    server.on("PATCH", AUTHENTICATE, {
      body: mfaPayload({
        mfa_enrollment_required: true,
        mfa_grace_period: true,
        mfa_grace_days_remaining: 3,
      }),
    });

    const { data } = await client.verifyMagicLinkToken(magicLinkToken());
    expect(data).toStrictEqual({
      ...EXPECTED_MFA_RESULT,
      mfaEnrollmentRequired: true,
      mfaGracePeriod: true,
      mfaGraceDaysRemaining: 3,
    });
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_REQUIRED]);
  });

  it("fills missing server fields with false/undefined (app_user_id is never exposed)", async () => {
    const { client } = await setup();
    server.on("PATCH", AUTHENTICATE, { body: { mfa_required: true, app_user_id: "au_9" } });

    const { data } = await client.verifyMagicLinkToken(magicLinkToken());
    expect(data).toStrictEqual({
      mfaRequired: true,
      mfaEnrollmentRequired: false,
      mfaGracePeriod: false,
      mfaGraceDaysRemaining: undefined,
      mfaChallenge: undefined,
      availableMethods: undefined,
    });
    expect(client.pendingMfaChallenge?.app_user_id).toBe("au_9");
  });

  it("without MFA returns authPayload + decoded magicPayload and emits MAGIC_VERIFIED (no sign in)", async () => {
    const { client, rec } = await setup();
    const pair = tokenPair();
    server.on("PATCH", AUTHENTICATE, { body: { ...pair, mfa_required: false } });

    const result = await client.verifyMagicLinkToken(magicLinkToken());
    expect(result).toStrictEqual({
      data: {
        authPayload: { ...pair, mfa_required: false },
        magicPayload: {
          uuid: "user_1",
          user_status: "active",
          webauthnEnabled: false,
          email: "ada@example.com",
        },
      },
      error: null,
    });
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.MAGIC_VERIFIED]);
    expect(localStorage.getItem(KEYS.access)).toBeNull();
  });

  it("signs in immediately when the current URL carries sct_sk=true", async () => {
    const { client, rec } = await setup({ href: "https://app.test/cb?sct_sk=true" });
    const pair = tokenPair();
    server.on("PATCH", AUTHENTICATE, { body: pair });

    await client.verifyMagicLinkToken(magicLinkToken());
    expect(localStorage.getItem(KEYS.access)).toBe(pair.access);
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.SIGNED_IN]);
  });

  it("also signs in immediately when the current URL carries sct_oauth", async () => {
    const { client, rec } = await setup({ href: "https://app.test/cb?sct_oauth=abc" });
    server.on("PATCH", AUTHENTICATE, { body: tokenPair() });
    await client.verifyMagicLinkToken(magicLinkToken());
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.SIGNED_IN]);
  });

  it("rejects a token that does not decode, without calling the API", async () => {
    const { client } = await setup();
    const { data, error } = await client.verifyMagicLinkToken("not-a-jwt");
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(InvalidMagicLinkError);
    expect(server.callsTo("PATCH", AUTHENTICATE)).toHaveLength(0);
  });

  it("passes an API error through unchanged", async () => {
    const { client } = await setup();
    server.on("PATCH", AUTHENTICATE, {
      status: 404,
      body: { error: "Magic link not found or expired" },
    });
    const { data, error } = await client.verifyMagicLinkToken(magicLinkToken());
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(BaseHttpError);
    expect((error as BaseHttpError).code).toBe(404);
  });

  // Known limitation, tracked separately: on the sct_sk path the sign-in
  // result is ignored, so a failed sign in still returns success.
  it("reports success on the sct_sk path even when the sign in itself failed", async () => {
    const { client, rec } = await setup({ href: "https://app.test/cb?sct_sk=true" });
    server.on("PATCH", AUTHENTICATE, { body: tokenPair() });
    server.on("GET", CURRENT_USER, { status: 500, body: {} });

    const { data, error } = await client.verifyMagicLinkToken(magicLinkToken());
    expect(error).toBeNull();
    expect(data).toHaveProperty("authPayload");
    expect(localStorage.getItem(KEYS.access)).toBeNull();
    expect(rec.names()).not.toContain(AUTH_CHANGE_EVENTS.SIGNED_IN);
  });

  // Known limitation, tracked separately: verifyMagicLink(url) reads the
  // token from `url` but sct_sk/sct_oauth from window.location.
  it("verifyMagicLink(url) reads sct_sk from window.location, not from the given url", async () => {
    const { client, rec } = await setup({ href: "https://app.test/elsewhere" });
    server.on("PATCH", AUTHENTICATE, { body: tokenPair() });

    await client.verifyMagicLink(
      `https://app.test/cb?sct_magic=${magicLinkToken()}&sct_sk=true`
    );
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.MAGIC_VERIFIED]);
    expect(localStorage.getItem(KEYS.access)).toBeNull();
  });
});

describe("signInWithMagicLinkToken", () => {
  it("returns { data: <MFA result>, error: null } and does not sign in", async () => {
    const { client } = await setup();
    server.on("PATCH", AUTHENTICATE, { body: mfaPayload() });
    expect(await client.signInWithMagicLinkToken(magicLinkToken())).toStrictEqual({
      data: EXPECTED_MFA_RESULT,
      error: null,
    });
    expect(server.callsTo("GET", CURRENT_USER)).toHaveLength(0);
  });

  it("returns { error: null } after signing in", async () => {
    const { client, rec } = await setup();
    const pair = tokenPair();
    server.on("PATCH", AUTHENTICATE, { body: pair });

    expect(await client.signInWithMagicLinkToken(magicLinkToken())).toStrictEqual({
      error: null,
    });
    expect(localStorage.getItem(KEYS.access)).toBe(pair.access);
    expect(rec.names()).toEqual([
      AUTH_CHANGE_EVENTS.MAGIC_VERIFIED,
      AUTH_CHANGE_EVENTS.SIGNED_IN,
    ]);
  });

  it("returns { error } (no data key) when verification fails", async () => {
    const { client } = await setup();
    const result = await client.signInWithMagicLinkToken("garbage");
    expect(Object.keys(result)).toEqual(["error"]);
    expect(result.error).toBeInstanceOf(InvalidMagicLinkError);
  });

  // Known limitation, tracked separately: with sct_sk=true in the URL,
  // signInWithMagicLinkToken signs in twice (two SIGNED_IN events).
  it("signs in twice when the URL carries sct_sk=true", async () => {
    const { client, rec } = await setup({ href: "https://app.test/cb?sct_sk=true" });
    server.on("PATCH", AUTHENTICATE, { body: tokenPair() });

    await client.signInWithMagicLinkToken(magicLinkToken());
    expect(server.callsTo("GET", CURRENT_USER)).toHaveLength(2);
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.SIGNED_IN, AUTH_CHANGE_EVENTS.SIGNED_IN]);
  });

  it("signInWithMagicLink(url) without a token returns InvalidMagicLinkError", async () => {
    const { client } = await setup();
    const result = await client.signInWithMagicLink("https://app.test/cb?other=1");
    expect(result.error).toBeInstanceOf(InvalidMagicLinkError);
  });
});

describe("verifyOtp", () => {
  const OTP_VERIFY = `${AUTH_PREFIX}/otps/verify`;

  it("returns the same MFA result shape and emits MFA_REQUIRED", async () => {
    const { client, rec } = await setup();
    server.on("GET", USERS, { body: { user: userFixture() } });
    server.on("POST", OTP_VERIFY, { body: mfaPayload() });

    const result = await client.verifyOtp("123456", "ada@example.com");

    expect(result).toStrictEqual({ data: EXPECTED_MFA_RESULT, error: null });
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.MFA_REQUIRED]);
    expect(client.pendingMfaChallenge).toEqual(mfaPayload());
    expect(server.callsTo("GET", USERS)[0].query.get("identifier")).toBe("ada@example.com");
    expect(server.callsTo("POST", OTP_VERIFY)[0].body).toEqual({
      otp: "123456",
      user_id: "user_1",
    });
  });

  it("without MFA returns authPayload + a magicPayload built from the user, and does not sign in", async () => {
    const { client, rec } = await setup();
    const pair = tokenPair();
    server.on("GET", USERS, { body: { user: userFixture({ webauthn_enabled: true }) } });
    server.on("POST", OTP_VERIFY, { body: pair });

    expect(await client.verifyOtp("123456", "ada@example.com")).toStrictEqual({
      data: {
        authPayload: pair,
        magicPayload: {
          uuid: "user_1",
          user_status: "active",
          webauthnEnabled: true,
          email: "ada@example.com",
        },
      },
      error: null,
    });
    expect(rec.names()).toEqual([]);
    expect(localStorage.getItem(KEYS.access)).toBeNull();
  });

  it("returns IdentifierNotRecognizedError for an unknown identifier, without verifying", async () => {
    const { client } = await setup();
    server.on("GET", USERS, { body: { user: null } });
    const { data, error } = await client.verifyOtp("123456", "nobody@example.com");
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(IdentifierNotRecognizedError);
    expect(server.callsTo("POST", OTP_VERIFY)).toHaveLength(0);
  });

  it("passes the raw lookup error through (not mapped to TechnicalError)", async () => {
    const { client } = await setup();
    server.on("GET", USERS, { status: 429, body: { error: "slow down" } });
    const { error } = await client.verifyOtp("123456", "ada@example.com");
    expect(error).toBeInstanceOf(BaseHttpError);
    expect((error as BaseHttpError).code).toBe(429);
  });
});

describe("WebAuthn sign in (signInWithVerifyDevice / signIn)", () => {
  const OPTIONS = {
    challenge: "chal",
    rpId: "app.test",
    allowCredentials: [{ id: "cred_1", type: "public-key" }],
  };
  const CREDENTIAL = { id: "cred_1", rawId: "cred_1", type: "public-key", response: {} };

  const setupWebauthn = async (
    finalizeBody: unknown,
    {
      knownCredential = true,
      appData = appDataFixture(),
    }: { knownCredential?: boolean; appData?: Record<string, unknown> } = {}
  ) => {
    const ctx = await setup({ appData });
    server.on("GET", USERS, { body: { user: userFixture({ webauthn_enabled: true }) } });
    server.on("POST", WEBAUTHN_INIT, { body: { options: OPTIONS } });
    server.on("POST", WEBAUTHN_FINALIZE, { body: finalizeBody });
    server.on("POST", `${AUTH_PREFIX}/magic_links/login`, { body: { magic_link: { id: "ml_1" } } });
    server.on("POST", `${AUTH_PREFIX}/otps/login`, { body: { otp: { id: "otp_1" } } });
    if (knownCredential) {
      localStorage.setItem(KEYS.cred, JSON.stringify({ user_1: ["cred_1"] }));
    }
    webauthnMock.get.mockResolvedValue(CREDENTIAL);
    return ctx;
  };

  it("signInWithVerifyDevice returns the MFA result; WEBAUTHN_VERIFY_SUCCESS is not emitted", async () => {
    const { client, rec } = await setupWebauthn(mfaPayload());

    const result = await client.signInWithVerifyDevice("ada@example.com");

    expect(result).toStrictEqual({ data: EXPECTED_MFA_RESULT, error: null });
    expect(rec.names()).toEqual([
      AUTH_CHANGE_EVENTS.WEBAUTHN_VERIFY_START,
      AUTH_CHANGE_EVENTS.MFA_REQUIRED,
    ]);
    expect(webauthnMock.get).toHaveBeenCalledWith({ publicKey: OPTIONS });
    expect(server.callsTo("POST", WEBAUTHN_INIT)[0].body).toEqual({
      identifier: "ada@example.com",
    });
    expect(server.callsTo("POST", WEBAUTHN_FINALIZE)[0].body).toEqual(CREDENTIAL);
    expect(client.pendingMfaChallenge).toEqual(mfaPayload());
  });

  it("signIn passes the WebAuthn MFA result through as { data, error: null }", async () => {
    const { client } = await setupWebauthn(mfaPayload({ mfa_enrollment_required: true }));
    const result = await client.signIn("ada@example.com");
    expect(result).toStrictEqual({
      data: { ...EXPECTED_MFA_RESULT, mfaEnrollmentRequired: true },
      error: null,
    });
  });

  it("without MFA signs in and signIn resolves { data: null, error: null }", async () => {
    const pair = tokenPair();
    const { client, rec } = await setupWebauthn(pair);

    expect(await client.signIn("ada@example.com")).toStrictEqual({ data: null, error: null });
    expect(localStorage.getItem(KEYS.access)).toBe(pair.access);
    expect(rec.names()).toEqual([
      AUTH_CHANGE_EVENTS.WEBAUTHN_VERIFY_START,
      AUTH_CHANGE_EVENTS.WEBAUTHN_VERIFY_SUCCESS,
      AUTH_CHANGE_EVENTS.SIGNED_IN,
    ]);
  });

  it("an unknown device falls back to a login magic link (MAGIC_NEW_DEVICE_PENDING, no MAGIC_PENDING)", async () => {
    const { client, rec } = await setupWebauthn(tokenPair(), { knownCredential: false });

    const result = await client.signIn("ada@example.com");

    expect(result).toEqual({ data: { magic_link: { id: "ml_1" } }, error: null });
    expect(webauthnMock.get).not.toHaveBeenCalled();
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.MAGIC_NEW_DEVICE_PENDING]);
    expect(server.callsTo("POST", `${AUTH_PREFIX}/magic_links/login`)[0].body).toEqual({
      identifier: "ada@example.com",
      webauthn_enabled: true,
    });
  });

  it("an unknown device on an OTP app falls back to OTP (OTP_NEW_DEVICE_PENDING)", async () => {
    const { client, rec } = await setupWebauthn(tokenPair(), {
      knownCredential: false,
      appData: appDataFixture({ email_auth_type: "otp" }),
    });
    await client.signIn("ada@example.com");
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.OTP_NEW_DEVICE_PENDING]);
    expect(server.callsTo("POST", `${AUTH_PREFIX}/otps/login`)).toHaveLength(1);
  });

  it("a cancelled browser prompt surfaces a WebAuthnError instead of falling back", async () => {
    const { client } = await setupWebauthn(tokenPair());
    webauthnMock.get.mockRejectedValue(
      Object.assign(new Error("cancelled"), { name: "NotAllowedError" })
    );
    const { data, error } = await client.signIn("ada@example.com");
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(WebAuthnError);
    expect(server.callsTo("POST", `${AUTH_PREFIX}/magic_links/login`)).toHaveLength(0);
  });

  it.each([
    ["passkeys_enabled: false on the app", { passkeys_enabled: false }, {}],
    ["options.webauthn = 'disabled'", {}, { webauthn: "disabled" }],
  ])("skips WebAuthn when %s", async (_label, appOverrides, options) => {
    const { client } = await setupWebauthn(tokenPair(), {
      appData: appDataFixture(appOverrides),
    });
    await client.signIn("ada@example.com", options as any);
    expect(server.callsTo("POST", WEBAUTHN_INIT)).toHaveLength(0);
    expect(server.callsTo("POST", `${AUTH_PREFIX}/magic_links/login`)).toHaveLength(1);
  });

  it("skips WebAuthn when the user has none enabled", async () => {
    const { client } = await setupWebauthn(tokenPair());
    server.on("GET", USERS, { body: { user: userFixture({ webauthn_enabled: false }) } });
    await client.signIn("ada@example.com");
    expect(server.callsTo("POST", WEBAUTHN_INIT)).toHaveLength(0);
  });

  // Passkeys are only used when the app data says `passkeys_enabled: true`;
  // a payload without the field is treated as disabled.
  it("treats a missing passkeys_enabled field as disabled", async () => {
    const appData = appDataFixture();
    delete (appData as any).passkeys_enabled;
    const { client } = await setupWebauthn(tokenPair(), { appData });
    await client.signIn("ada@example.com");
    expect(server.callsTo("POST", WEBAUTHN_INIT)).toHaveLength(0);
    expect(server.callsTo("POST", `${AUTH_PREFIX}/magic_links/login`)).toHaveLength(1);
  });
});

describe("MFA follow-up helpers", () => {
  it("signInWithTokenPayload with mfa_enrollment_suggested emits MFA_ENROLLMENT_SUGGESTED before SIGNED_IN", async () => {
    const { client, rec } = await setup();
    await client.signInWithTokenPayload({
      ...tokenPair(),
      mfa_enrollment_suggested: true,
      mfa_grace_days_remaining: 5,
      available_methods: ["totp"],
    } as any);

    expect(rec.names()).toEqual([
      AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_SUGGESTED,
      AUTH_CHANGE_EVENTS.SIGNED_IN,
    ]);
    expect(client.pendingMfaEnrollmentSuggestion).toEqual({
      mfa_grace_days_remaining: 5,
      available_methods: ["totp"],
    });
  });

  it("verifyMfaChallenge posts the code, clears the pending challenge and signs in", async () => {
    const { client, rec } = await setup();
    server.on("PATCH", AUTHENTICATE, { body: mfaPayload() });
    await client.verifyMagicLinkToken(magicLinkToken());
    const pair = tokenPair();
    server.on("POST", `${AUTH_PREFIX}/challenges/ch_tok/verify`, { body: pair });

    expect(await client.verifyMfaChallenge("ch_tok", "654321")).toEqual({ error: null });
    expect(server.callsTo("POST", `${AUTH_PREFIX}/challenges/ch_tok/verify`)[0].body).toEqual({
      code: "654321",
    });
    expect(client.pendingMfaChallenge).toBeNull();
    expect(localStorage.getItem(KEYS.access)).toBe(pair.access);
    expect(rec.names().at(-1)).toBe(AUTH_CHANGE_EVENTS.SIGNED_IN);
  });

  it("a failed verifyMfaChallenge keeps the pending challenge", async () => {
    const { client } = await setup();
    server.on("PATCH", AUTHENTICATE, { body: mfaPayload() });
    await client.verifyMagicLinkToken(magicLinkToken());
    server.on("POST", `${AUTH_PREFIX}/challenges/ch_tok/verify`, { status: 422, body: {} });

    const result = await client.verifyMfaChallenge("ch_tok", "000000");
    expect(result).toEqual({ data: null, error: expect.any(BaseHttpError) });
    expect((result.error as BaseHttpError).code).toBe(422);
    expect(client.pendingMfaChallenge).not.toBeNull();
  });

  it("switchMfaMethod cancels the old challenge, creates a new one for the pending app user, and updates the pending state", async () => {
    const { client } = await setup();
    server.on("PATCH", AUTHENTICATE, { body: mfaPayload() });
    await client.verifyMagicLinkToken(magicLinkToken());
    const next = { ...CHALLENGE, token: "ch_new", method: "email_otp" };
    server.on("DELETE", `${AUTH_PREFIX}/challenges/ch_tok`, { status: 200, body: {} });
    server.on("POST", `${AUTH_PREFIX}/challenges`, { body: { challenge: next } });

    expect(await client.switchMfaMethod("ch_tok", "email_otp")).toEqual({
      data: next,
      error: null,
    });
    expect(server.callsTo("DELETE", `${AUTH_PREFIX}/challenges/ch_tok`)).toHaveLength(1);
    expect(server.callsTo("POST", `${AUTH_PREFIX}/challenges`)[0].body).toEqual({
      purpose: "mfa",
      method: "email_otp",
      app_user_id: "au_1",
    });
    expect(client.pendingMfaChallenge?.mfa_challenge).toEqual(next);
  });

  it("switchMfaMethod without a pending challenge omits app_user_id", async () => {
    const { client } = await setup();
    server.on("DELETE", `${AUTH_PREFIX}/challenges/x`, { status: 200, body: {} });
    server.on("POST", `${AUTH_PREFIX}/challenges`, { body: { challenge: CHALLENGE } });
    await client.switchMfaMethod("x", "totp");
    expect(server.callsTo("POST", `${AUTH_PREFIX}/challenges`)[0].body).toEqual({
      purpose: "mfa",
      method: "totp",
    });
    expect(client.pendingMfaChallenge).toBeNull();
  });

  it("claimMsAuthenticatorSession exchanges the challenge and signs in", async () => {
    const { client, rec } = await setup();
    const pair = tokenPair();
    server.on("POST", `${AUTH_PREFIX}/challenges/ch_ms/session`, { body: pair });
    expect(await client.claimMsAuthenticatorSession("ch_ms")).toEqual({ error: null });
    expect(localStorage.getItem(KEYS.access)).toBe(pair.access);
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.SIGNED_IN]);
  });

  it("signInWithTokenPayload returns UnknownSignInError and clears storage when /current_user fails", async () => {
    const { client } = await setup();
    server.on("GET", CURRENT_USER, { status: 401, body: {} });
    const result = await client.signInWithTokenPayload(tokenPair() as any);
    expect(result.error).toBeInstanceOf(UnknownSignInError);
    expect(localStorage.getItem(KEYS.access)).toBeNull();
    expect(localStorage.getItem(KEYS.refresh)).toBeNull();
  });
});
