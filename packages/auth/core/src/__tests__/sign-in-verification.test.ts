/**
 * Attack protection's code step for a magic link sign-in: the API answers
 * PATCH /magic_links/authenticate with 202 verification_required and a
 * step-up challenge. verifyMagicLinkToken reports it (no session, no
 * MAGIC_VERIFIED), and verifySignInVerification verifies the code with the
 * challenge token alone, then checks the same link again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../ScuteClient";
import { AUTH_CHANGE_EVENTS } from "../lib/constants";
import { BaseHttpError, InvalidMagicLinkError } from "../lib/errors";
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

const AUTHENTICATE = `${AUTH_PREFIX}/magic_links/authenticate`;
const VERIFY = `${AUTH_PREFIX}/challenges/sv_tok/verify`;
const VERIFICATION = { token: "sv_tok", method: "email_otp", expires_at: "2030-01-01T00:00:00Z" };
const REQUIRED = {
  verification_required: true,
  reason: "security_verification",
  threats: ["new_device"],
  verification: VERIFICATION,
};

let server: TestServer;
let localStorage: FakeLocalStorage;

const setup = async () => {
  ({ localStorage } = installBrowser({ href: "https://app.test/callback" }));
  server = createServer({ appData: appDataFixture() });
  server.on("GET", `${AUTH_PREFIX}/current_user`, { body: { user: userFixture() } });
  const client = createClient({ appId: APP_ID, baseUrl: BASE_URL, preferences: { ...quietPreferences } });
  await ready(client);
  return { client, rec: recordEvents(client) };
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verifyMagicLinkToken with attack protection", () => {
  it("reports verificationRequired, keeps the challenge pending and signs nobody in", async () => {
    const { client, rec } = await setup();
    server.on("PATCH", AUTHENTICATE, { status: 202, body: REQUIRED });

    const result = await client.verifyMagicLinkToken(magicLinkToken());

    expect(result).toStrictEqual({
      data: {
        verificationRequired: true,
        verification: VERIFICATION,
        reason: "security_verification",
        threats: ["new_device"],
      },
      error: null,
    });
    expect(client.pendingSignInVerification).toEqual(VERIFICATION);
    expect(rec.names()).toEqual([AUTH_CHANGE_EVENTS.VERIFICATION_REQUIRED]);
    expect(localStorage.getItem(KEYS.access)).toBeNull();
  });

  it("reports a missing challenge as verification null", async () => {
    const { client } = await setup();
    server.on("PATCH", AUTHENTICATE, { status: 202, body: { verification_required: true } });
    const { data } = await client.verifyMagicLinkToken(magicLinkToken());
    expect(data).toMatchObject({ verificationRequired: true, verification: null, threats: [] });
    expect(client.pendingSignInVerification).toBeNull();
  });

  it("signInWithMagicLinkToken passes the answer through without signing in", async () => {
    const { client } = await setup();
    server.on("PATCH", AUTHENTICATE, { status: 202, body: REQUIRED });
    const result = await client.signInWithMagicLinkToken(magicLinkToken());
    expect(result.data).toMatchObject({ verificationRequired: true });
    expect(localStorage.getItem(KEYS.access)).toBeNull();
  });
});

describe("verifySignInVerification", () => {
  it("verifies the code with the challenge token, then the same link signs in", async () => {
    const { client, rec } = await setup();
    const token = magicLinkToken();
    server.on("PATCH", AUTHENTICATE, { status: 202, body: REQUIRED });
    await client.verifyMagicLinkToken(token);

    const pair = { access: accessToken(), refresh: refreshToken() };
    server.on("POST", VERIFY, { body: { status: "completed" } });
    server.on("PATCH", AUTHENTICATE, { body: pair });

    const result = await client.verifySignInVerification("123456");

    const [verifyCall] = server.callsTo("POST", VERIFY);
    expect(verifyCall.body).toEqual({ code: "123456" });
    expect(verifyCall.headers.authorization).toBeUndefined();
    const authenticates = server.callsTo("PATCH", AUTHENTICATE);
    expect(authenticates).toHaveLength(2);
    expect(authenticates[1].body).toEqual({ token });
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ authPayload: pair });
    expect(client.pendingSignInVerification).toBeNull();
    expect(rec.names()).toContain(AUTH_CHANGE_EVENTS.MAGIC_VERIFIED);
  });

  it("returns a wrong code as the API error and keeps the challenge pending", async () => {
    const { client } = await setup();
    server.on("PATCH", AUTHENTICATE, { status: 202, body: REQUIRED });
    await client.verifyMagicLinkToken(magicLinkToken());
    server.on("POST", VERIFY, { status: 422, body: { error: "Invalid code", remaining_attempts: 2 } });

    const { data, error } = await client.verifySignInVerification("000000");

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(BaseHttpError);
    expect((error as BaseHttpError).code).toBe(422);
    expect(server.callsTo("PATCH", AUTHENTICATE)).toHaveLength(1);
    expect(client.pendingSignInVerification).toEqual(VERIFICATION);
  });

  it("takes explicit tokens", async () => {
    const { client } = await setup();
    const token = magicLinkToken();
    server.on("POST", `${AUTH_PREFIX}/challenges/other/verify`, { body: { status: "completed" } });
    server.on("PATCH", AUTHENTICATE, { body: { access: accessToken(), refresh: refreshToken() } });
    const { error } = await client.verifySignInVerification("123456", { challengeToken: "other", magicToken: token });
    expect(error).toBeNull();
    expect(server.callsTo("PATCH", AUTHENTICATE)[0].body).toEqual({ token });
  });

  it("fails without a pending verification", async () => {
    const { client } = await setup();
    const { error } = await client.verifySignInVerification("123456");
    expect(error).toBeInstanceOf(InvalidMagicLinkError);
    expect(server.callsTo("POST", VERIFY)).toHaveLength(0);
  });
});
