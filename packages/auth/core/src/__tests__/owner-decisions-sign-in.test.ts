/**
 * Sign-in and MFA owner decisions on the client: a second factor set up
 * with a sign-in's setup-only pass when MFA is required (D18), the nudge
 * when optional MFA no longer accepts the person's factor (D17), an email
 * or phone confirmed
 * first (D15), the waiting device's own steps (D2), a challenge link that
 * signs nobody in (D16), and refreshes refused for the network or ended
 * for being idle (D11, D14).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../ScuteClient";
import { AUTH_CHANGE_EVENTS, SCUTE_SETUP_TOKEN_HEADER } from "../lib/constants";
import { BaseHttpError } from "../lib/errors";
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
  MemoryAdapter,
  quietPreferences,
  ready,
  recordEvents,
  refreshToken,
  seedSession,
  userFixture,
  type TestServer,
} from "./harness";

const AUTHENTICATE = `${AUTH_PREFIX}/magic_links/authenticate`;
const STATUS = `${AUTH_PREFIX}/magic_links/status`;
const ENROLL = `${AUTH_PREFIX}/mfa/enroll`;
const ENROLL_VERIFY = `${AUTH_PREFIX}/mfa/enroll/verify`;
const CONTACT = `${AUTH_PREFIX}/sign_in/contact`;
const REFRESH = `${AUTH_PREFIX}/tokens/refresh`;
const CURRENT_USER = `${AUTH_PREFIX}/current_user`;

const SETUP = "scsetup_abc";
const setupRequired = (overrides: Record<string, unknown> = {}) => ({
  mfa_required: true,
  mfa_enrollment_required: true,
  app_user_id: "au_1",
  available_methods: ["totp", "sms"],
  setup_token: SETUP,
  setup_expires_at: "2030-01-01T00:30:00Z",
  ...overrides,
});

const CONTACT_CHALLENGE = {
  token: "cv_tok",
  status: "pending",
  purpose: "verify_contact",
  method: "email_otp",
  expires_at: "2030-01-01T00:10:00Z",
};
const contactRequired = (overrides: Record<string, unknown> = {}) => ({
  contact_verification_required: true,
  field: "email",
  app_user_id: "au_1",
  challenge: CONTACT_CHALLENGE,
  ...overrides,
});

const MFA_CHALLENGE = { token: "mfa_tok", status: "pending", purpose: "mfa", method: "totp", expires_at: "2030-01-01T00:10:00Z" };

let server: TestServer;
let localStorage: FakeLocalStorage;

const setup = async () => {
  ({ localStorage } = installBrowser({ href: "https://app.test/callback" }));
  server = createServer({ appData: appDataFixture() });
  server.on("GET", CURRENT_USER, { body: { user: userFixture() } });
  const client = createClient({ appId: APP_ID, baseUrl: BASE_URL, preferences: { ...quietPreferences } });
  await ready(client);
  return { client, rec: recordEvents(client) };
};

const tokenPair = () => ({ access: accessToken(), refresh: refreshToken() });

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("D18: setting up a second factor with the setup pass", () => {
  it("returns the setup token with MFA_ENROLLMENT_REQUIRED and keeps it pending", async () => {
    const { client, rec } = await setup();
    server.on("PATCH", AUTHENTICATE, { body: setupRequired() });

    const { data, error } = await client.verifyMagicLinkToken(magicLinkToken());

    expect(error).toBeNull();
    expect(data).toMatchObject({
      mfaRequired: true,
      mfaEnrollmentRequired: true,
      availableMethods: ["totp", "sms"],
      setupToken: SETUP,
      setupExpiresAt: "2030-01-01T00:30:00Z",
    });
    expect(client.pendingMfaChallenge?.setup_token).toBe(SETUP);
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_REQUIRED]);
    expect(localStorage.getItem(KEYS.access)).toBeNull();
  });

  it("enrolls with the setup token header and no session", async () => {
    const { client } = await setup();
    server.on("POST", ENROLL, {
      status: 201,
      body: { enrollment: { id: "enr_1", method: "totp", name: null, verified: false, is_default: false }, provisioning_uri: "otpauth://totp/x", secret: "ABC" },
    });

    const { data, error } = await client.enrollMfaWithSetupToken(SETUP, "totp");

    expect(error).toBeNull();
    expect(data).toMatchObject({ provisioning_uri: "otpauth://totp/x", secret: "ABC", enrollment: { id: "enr_1" } });
    const [call] = server.callsTo("POST", ENROLL);
    expect(call.headers[SCUTE_SETUP_TOKEN_HEADER.toLowerCase()]).toBe(SETUP);
    expect(call.headers["x-authorization"]).toBeUndefined();
    expect(call.body).toEqual({ method: "totp" });
  });

  it("sends the phone for a text code", async () => {
    const { client } = await setup();
    server.on("POST", ENROLL, { status: 201, body: { enrollment: { id: "enr_2", method: "sms", name: null, verified: false, is_default: false } } });
    await client.enrollMfaWithSetupToken(SETUP, "sms", "+12015550142");
    expect(server.callsTo("POST", ENROLL)[0].body).toEqual({ method: "sms", secret_data: "+12015550142" });
  });

  it("verifying the factor finishes the sign-in with the tokens it answers", async () => {
    const { client, rec } = await setup();
    const pair = tokenPair();
    server.on("POST", ENROLL_VERIFY, { body: { ...pair, enrollment: { id: "enr_1", verified: true } } });

    const { data, error } = await client.verifyMfaEnrollmentWithSetupToken(SETUP, "enr_1", "123456");

    expect(error).toBeNull();
    expect(data).toBeNull();
    const [call] = server.callsTo("POST", ENROLL_VERIFY);
    expect(call.body).toEqual({ enrollment_id: "enr_1", code: "123456" });
    expect(call.headers[SCUTE_SETUP_TOKEN_HEADER.toLowerCase()]).toBe(SETUP);
    expect(call.headers["x-authorization"]).toBeUndefined();
    expect(localStorage.getItem(KEYS.access)).toBe(pair.access);
    expect(rec.names()).toContain(AUTH_CHANGE_EVENTS.SIGNED_IN);
  });

  it.each([
    [422, "invalid_code"],
    [401, "setup_expired"],
  ])("returns a %i %s without signing in", async (status, code) => {
    const { client, rec } = await setup();
    server.on("POST", ENROLL_VERIFY, { status, body: { error: "nope", error_code: code } });

    const { data, error } = await client.verifyMfaEnrollmentWithSetupToken(SETUP, "enr_1", "000000");

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(BaseHttpError);
    expect((error as BaseHttpError).json?.error_code).toBe(code);
    expect(localStorage.getItem(KEYS.access)).toBeNull();
    expect(rec.names()).not.toContain(AUTH_CHANGE_EVENTS.SIGNED_IN);
  });
});

describe("D17: optional MFA whose factor the app no longer accepts", () => {
  it("signs in and suggests another factor, with no grace days", async () => {
    const { client, rec } = await setup();
    const pair = tokenPair();

    const { error } = await client.signInWithTokenPayload({
      ...pair,
      mfa_enrollment_suggested: true,
      mfa_factor_not_allowed: true,
      available_methods: ["totp"],
    } as any);

    expect(error).toBeNull();
    expect(client.pendingMfaEnrollmentSuggestion).toStrictEqual({
      mfa_grace_days_remaining: undefined,
      available_methods: ["totp"],
      mfa_factor_not_allowed: true,
    });
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_SUGGESTED, AUTH_CHANGE_EVENTS.SIGNED_IN]);
    expect(localStorage.getItem(KEYS.access)).toBe(pair.access);
  });
});

describe("D15: confirming an email or phone first", () => {
  it("a code sign-in answers the step with CONTACT_VERIFICATION_REQUIRED", async () => {
    const { client, rec } = await setup();
    server.on("GET", `${AUTH_PREFIX}/users`, { body: { user: userFixture() } });
    server.on("POST", `${AUTH_PREFIX}/otps/verify`, { body: contactRequired() });

    const { data, error } = await client.verifyOtp("123456", "ada@example.com");

    expect(error).toBeNull();
    expect(data).toStrictEqual({
      contactVerificationRequired: true,
      field: "email",
      challenge: CONTACT_CHALLENGE,
      setupToken: null,
      setupExpiresAt: null,
    });
    expect(client.pendingContactVerification).toEqual(contactRequired());
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.CONTACT_VERIFICATION_REQUIRED]);
  });

  it("a magic link answers the step too, without MAGIC_VERIFIED", async () => {
    const { client, rec } = await setup();
    server.on("PATCH", AUTHENTICATE, { body: contactRequired({ field: "phone", challenge: { ...CONTACT_CHALLENGE, method: "sms_otp" } }) });
    const result = await client.signInWithMagicLinkToken(magicLinkToken());
    expect("data" in result ? result.data : null).toMatchObject({ contactVerificationRequired: true, field: "phone" });
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.CONTACT_VERIFICATION_REQUIRED]);
    expect(localStorage.getItem(KEYS.access)).toBeNull();
  });

  it("verifies the code without a key and signs in with the tokens", async () => {
    const { client, rec } = await setup();
    server.on("PATCH", AUTHENTICATE, { body: contactRequired() });
    await client.verifyMagicLinkToken(magicLinkToken());
    const pair = tokenPair();
    server.on("POST", `${AUTH_PREFIX}/challenges/cv_tok/verify`, { body: { ...pair, challenge: CONTACT_CHALLENGE } });

    const { data, error } = await client.verifyContactVerification("123456");

    expect(error).toBeNull();
    expect(data).toBeNull();
    const [call] = server.callsTo("POST", `${AUTH_PREFIX}/challenges/cv_tok/verify`);
    expect(call.body).toEqual({ code: "123456" });
    expect(call.headers.authorization).toBeUndefined();
    expect(localStorage.getItem(KEYS.access)).toBe(pair.access);
    expect(rec.names()).toContain(AUTH_CHANGE_EVENTS.SIGNED_IN);
    expect(client.pendingContactVerification).toBeNull();
  });

  it("routes the next step the code answers (MFA) through the same handler", async () => {
    const { client, rec } = await setup();
    server.on("POST", `${AUTH_PREFIX}/challenges/cv_tok/verify`, {
      body: { mfa_required: true, app_user_id: "au_1", available_methods: ["totp"], mfa_challenge: MFA_CHALLENGE },
    });

    const { data, error } = await client.verifyContactVerification("123456", "cv_tok");

    expect(error).toBeNull();
    expect(data).toMatchObject({ mfaRequired: true, mfaChallenge: MFA_CHALLENGE });
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.MFA_REQUIRED]);
    expect(client.pendingMfaChallenge?.mfa_challenge).toEqual(MFA_CHALLENGE);
    expect(localStorage.getItem(KEYS.access)).toBeNull();
  });

  it("returns a wrong code as the API's 422", async () => {
    const { client } = await setup();
    server.on("POST", `${AUTH_PREFIX}/challenges/cv_tok/verify`, { status: 422, body: { error: "Invalid code", remaining_attempts: 2 } });
    const { data, error } = await client.verifyContactVerification("000000", "cv_tok");
    expect(data).toBeNull();
    expect((error as BaseHttpError).code).toBe(422);
  });

  it("with only a setup token: names the contact, then verifies the code sent to it", async () => {
    const { client } = await setup();
    server.on("PATCH", AUTHENTICATE, {
      body: { contact_verification_required: true, field: "phone", app_user_id: "au_1", setup_token: SETUP, setup_expires_at: "x" },
    });
    const { data: step } = await client.verifyMagicLinkToken(magicLinkToken());
    expect(step).toMatchObject({ contactVerificationRequired: true, field: "phone", challenge: null, setupToken: SETUP });

    const challenge = { ...CONTACT_CHALLENGE, token: "cv_new", method: "sms_otp" };
    server.on("POST", CONTACT, { status: 201, body: { field: "phone", challenge } });
    const { data, error } = await client.addSignInContact("+12015550142");
    expect(error).toBeNull();
    expect(data?.challenge).toEqual(challenge);
    expect(server.callsTo("POST", CONTACT)[0].body).toEqual({ setup_token: SETUP, identifier: "+12015550142" });
    expect(client.pendingContactVerification?.challenge).toEqual(challenge);

    server.on("POST", `${AUTH_PREFIX}/challenges/cv_new/verify`, { body: tokenPair() });
    expect((await client.verifyContactVerification("123456")).error).toBeNull();
  });

  it("returns contact_taken from naming the contact", async () => {
    const { client } = await setup();
    server.on("POST", CONTACT, { status: 409, body: { error: "That phone is already in use", error_code: "contact_taken" } });
    const { error } = await client.addSignInContact("+12015550142", SETUP);
    expect((error as BaseHttpError).json?.error_code).toBe("contact_taken");
  });

  it("resends the code keyless and keeps the new challenge", async () => {
    const { client } = await setup();
    server.on("PATCH", AUTHENTICATE, { body: contactRequired() });
    await client.verifyMagicLinkToken(magicLinkToken());
    const fresh = { ...CONTACT_CHALLENGE, token: "cv_2" };
    server.on("POST", `${AUTH_PREFIX}/challenges/cv_tok/resend`, { body: { challenge: fresh } });
    const { error } = await client.resendContactVerification();
    expect(error).toBeNull();
    expect(client.pendingContactVerification?.challenge).toEqual(fresh);
  });

  it("after the MFA step: verifyMfaChallenge answers the contact step instead of signing in", async () => {
    const { client, rec } = await setup();
    server.on("POST", `${AUTH_PREFIX}/challenges/mfa_tok/verify`, { body: contactRequired() });
    const result = await client.verifyMfaChallenge("mfa_tok", "123456");
    expect("data" in result ? result.data : null).toMatchObject({ contactVerificationRequired: true });
    expect(result.error).toBeNull();
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.CONTACT_VERIFICATION_REQUIRED]);
    expect(localStorage.getItem(KEYS.access)).toBeNull();
  });
});

describe("D2: the device that asked for the link", () => {
  it("does its own setup or contact step from the status answer", async () => {
    const { client, rec } = await setup();
    const setupStep = await client.signInWithMagicLinkStatus(setupRequired() as any);
    expect(setupStep.data).toMatchObject({ mfaEnrollmentRequired: true, setupToken: SETUP });
    const contactStep = await client.signInWithMagicLinkStatus(contactRequired() as any);
    expect(contactStep.data).toMatchObject({ contactVerificationRequired: true });
    expect(rec.names()).toEqual([
      AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_REQUIRED,
      AUTH_CHANGE_EVENTS.CONTACT_VERIFICATION_REQUIRED,
    ]);
  });

  it("returns 409 sign_in_pending as an error to keep polling through", async () => {
    const { client } = await setup();
    server.on("POST", STATUS, { status: 409, body: { error: "Waiting", error_code: "sign_in_pending" } });
    const { data, error } = await client.getMagicLinkStatus("ml_1");
    expect(data).toBeNull();
    expect((error as BaseHttpError).json?.error_code).toBe("sign_in_pending");
  });
});

describe("D16: a challenge link that signs nobody in", () => {
  it("answers challengeCompleted with the intent, no session and no event", async () => {
    const { client, rec } = await setup();
    server.on("PATCH", AUTHENTICATE, {
      body: {
        status: "completed",
        signed_in: false,
        challenge: { token: "c1", status: "completed", purpose: "custom", method: "magic_link", intent: "approve_payout" },
        intent: "approve_payout",
        intent_fields: { amount: 10 },
      },
    });

    const result = await client.signInWithMagicLinkToken(magicLinkToken());

    expect(result.error).toBeNull();
    expect("data" in result ? result.data : null).toMatchObject({ challengeCompleted: true, signedIn: false, intent: "approve_payout", intentFields: { amount: 10 } });
    expect(rec.names()).toEqual([]);
    expect(localStorage.getItem(KEYS.access)).toBeNull();
  });
});

describe("D11, D14: refreshes", () => {
  let storage: MemoryAdapter;
  const newClient = () =>
    createClient({
      appId: APP_ID,
      baseUrl: BASE_URL,
      preferences: { ...quietPreferences, sessionStorageAdapter: storage as any },
    } as any);

  beforeEach(() => {
    server = createServer();
    server.on("GET", CURRENT_USER, { body: { user: userFixture() } });
    storage = new MemoryAdapter();
  });

  it.each(["ip_blocked", "country_blocked"])("keeps the session on a 403 %s (the network, not the session)", async (code) => {
    server.on("POST", REFRESH, { status: 403, body: { error: "blocked", error_code: code } });
    const tokens = { access: accessToken(), refresh: refreshToken() };
    seedSession(storage, tokens);
    const client = newClient();
    const rec = recordEvents(client);

    const { error } = await client.refreshSession();

    expect((error as BaseHttpError).code).toBe(403);
    expect(storage.map.get(KEYS.refresh)).toBe(tokens.refresh);
    expect(rec.names()).not.toContain(AUTH_CHANGE_EVENTS.SESSION_EXPIRED);
  });

  it("still ends the session on another 403", async () => {
    server.on("POST", REFRESH, { status: 403, body: { error: "not for this app" } });
    seedSession(storage, { access: accessToken(), refresh: refreshToken() });
    await newClient().refreshSession();
    expect(storage.snapshot()).toEqual({});
  });

  it("ends an idle session like any 401 and says why", async () => {
    server.on("POST", REFRESH, { status: 401, body: { error: "Signed out after being inactive", error_code: "session_idle" } });
    seedSession(storage, { access: accessToken(), refresh: refreshToken() });
    const client = newClient();
    const rec = recordEvents(client);

    await client.refreshSession();

    expect(storage.snapshot()).toEqual({});
    expect(rec.names()).toContain(AUTH_CHANGE_EVENTS.SESSION_EXPIRED);
    expect(client.sessionEndReason).toBe("session_idle");

    // A new session forgets it.
    await (client as any).setSession({ access: accessToken(), refresh: refreshToken() });
    expect(client.sessionEndReason).toBeNull();
  });

  it("has no reason for another 401", async () => {
    server.on("POST", REFRESH, { status: 401, body: { error: "revoked" } });
    seedSession(storage, { access: accessToken(), refresh: refreshToken() });
    const client = newClient();
    await client.refreshSession();
    expect(client.sessionEndReason).toBeNull();
  });
});
