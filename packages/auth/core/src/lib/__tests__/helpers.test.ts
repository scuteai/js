/**
 * Characterization of src/lib/helpers.ts: token decoding, identifier
 * sniffing, header builders and environment detection. These are the
 * primitives every ScuteClient flow sits on, so they are pinned first.
 * scrubAuthTokensFromUrl is covered in scrub-auth-tokens.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accessTokenHeader,
  decodeAccessToken,
  decodeMagicLinkToken,
  decodeRefreshToken,
  Deferred,
  getMagicLinkTokenPayloadFromUser,
  isBrowser,
  isMaybePhoneNumber,
  isValidDomain,
  isWebauthnSupported,
  refreshTokenHeaders,
} from "../helpers";
import { makeJwt, nowSeconds } from "../../__tests__/harness";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("decodeAccessToken", () => {
  it("returns expiresAt (exp in ms) and userId (uuid) for a well formed token", () => {
    const exp = nowSeconds() + 600;
    expect(decodeAccessToken(makeJwt({ uuid: "user_1", exp }))).toEqual({
      expiresAt: new Date(exp * 1000),
      userId: "user_1",
    });
  });

  it("returns null when uuid is missing", () => {
    expect(decodeAccessToken(makeJwt({ exp: nowSeconds() + 600 }))).toBeNull();
  });

  it("returns null when exp is missing or 0", () => {
    expect(decodeAccessToken(makeJwt({ uuid: "u" }))).toBeNull();
    expect(decodeAccessToken(makeJwt({ uuid: "u", exp: 0 }))).toBeNull();
  });

  it.each([
    ["empty string", ""],
    ["single segment", "abc"],
    ["undecodable payload", "a.b.c"],
    ["payload is not JSON", `x.${Buffer.from("not json").toString("base64url")}.y`],
    ["non string input", undefined as unknown as string],
  ])("returns null for %s instead of throwing", (_label, token) => {
    expect(decodeAccessToken(token)).toBeNull();
  });

  it("does not reject an already expired token (expiry is the caller's job)", () => {
    const exp = nowSeconds() - 3600;
    const decoded = decodeAccessToken(makeJwt({ uuid: "u", exp }));
    expect(decoded?.expiresAt.getTime()).toBe(exp * 1000);
    expect(decoded!.expiresAt.getTime()).toBeLessThan(Date.now());
  });

  it("ignores the signature segment entirely (no client-side verification)", () => {
    const exp = nowSeconds() + 60;
    const [h, p] = makeJwt({ uuid: "u", exp }).split(".");
    expect(decodeAccessToken(`${h}.${p}.`)).not.toBeNull();
    expect(decodeAccessToken(`${h}.${p}.forged`)).not.toBeNull();
  });

  it("passes a numeric uuid through as a number (typed as string)", () => {
    const decoded = decodeAccessToken(makeJwt({ uuid: 42, exp: nowSeconds() + 60 }));
    expect(decoded?.userId).toBe(42);
  });

  // Known limitation, tracked separately: a non-numeric `exp` is accepted
  // and produces an Invalid Date.
  it("accepts a non-numeric exp and yields an Invalid Date", () => {
    const decoded = decodeAccessToken(makeJwt({ uuid: "u", exp: "tomorrow" }));
    expect(decoded).not.toBeNull();
    expect(Number.isNaN(decoded!.expiresAt.getTime())).toBe(true);
  });
});

describe("decodeRefreshToken", () => {
  it("only requires exp (no uuid needed)", () => {
    const exp = nowSeconds() + 60;
    expect(decodeRefreshToken(makeJwt({ exp }))).toEqual({
      expiresAt: new Date(exp * 1000),
    });
  });

  it("returns null without exp or for garbage", () => {
    expect(decodeRefreshToken(makeJwt({ uuid: "u" }))).toBeNull();
    expect(decodeRefreshToken("garbage")).toBeNull();
  });
});

describe("decodeMagicLinkToken", () => {
  it("keeps only uuid, user_status, webauthnEnabled and email", () => {
    const token = makeJwt({
      uuid: "user_1",
      user_status: "pending",
      webauthnEnabled: true,
      email: "ada@example.com",
      exp: nowSeconds() + 60,
      secret_claim: "dropped",
    });
    expect(decodeMagicLinkToken(token)).toStrictEqual({
      uuid: "user_1",
      user_status: "pending",
      webauthnEnabled: true,
      email: "ada@example.com",
    });
  });

  it("returns null when uuid is absent or the token is malformed", () => {
    expect(decodeMagicLinkToken(makeJwt({ email: "a@b.co" }))).toBeNull();
    expect(decodeMagicLinkToken("not-a-jwt")).toBeNull();
  });

  it("only checks uuid !== undefined, so uuid: null is accepted", () => {
    expect(decodeMagicLinkToken(makeJwt({ uuid: null }))).toMatchObject({
      uuid: null,
    });
  });

  it("does not check exp: an expired magic link token still decodes", () => {
    expect(
      decodeMagicLinkToken(makeJwt({ uuid: "u", exp: nowSeconds() - 3600 }))
    ).not.toBeNull();
  });
});

describe("getMagicLinkTokenPayloadFromUser", () => {
  it("maps a ScuteUser onto the magic link payload shape", () => {
    expect(
      getMagicLinkTokenPayloadFromUser({
        id: "user_9",
        status: "active",
        webauthn_enabled: true,
        email: "x@y.z",
      } as any)
    ).toStrictEqual({
      uuid: "user_9",
      user_status: "active",
      webauthnEnabled: true,
      email: "x@y.z",
    });
  });

  it("turns a null email into undefined", () => {
    const payload = getMagicLinkTokenPayloadFromUser({
      id: "u",
      status: "active",
      webauthn_enabled: false,
      email: null,
    } as any);
    expect(payload.email).toBeUndefined();
  });
});

describe("isMaybePhoneNumber", () => {
  it.each([
    ["+1 (555) 123-4567", true],
    ["+905551234567", true],
    ["5551234567", true],
    ["ada@example.com", false],
    ["+1 555 abc", false],
  ])("%s -> %s", (input, expected) => {
    expect(Boolean(isMaybePhoneNumber(input))).toBe(expected);
  });

  it("returns the empty string (falsy, not false) for an empty identifier", () => {
    expect(isMaybePhoneNumber("")).toBe("");
  });

  // Known limitation, tracked separately: no digit is required, so
  // punctuation-only or whitespace-only strings count as phone numbers.
  it("treats punctuation-only and whitespace-only strings as phone numbers", () => {
    expect(isMaybePhoneNumber("()-")).toBe(true);
    expect(isMaybePhoneNumber("   ")).toBe(true);
  });
});

describe("header builders", () => {
  it("accessTokenHeader uses X-Authorization and is empty for a missing token", () => {
    expect(accessTokenHeader("jwt_a")).toEqual({ "X-Authorization": "jwt_a" });
    expect(accessTokenHeader(null)).toEqual({});
    expect(accessTokenHeader("")).toEqual({});
  });

  it("refreshTokenHeaders uses X-Refresh-Token and is empty for a missing token", () => {
    expect(refreshTokenHeaders("jwt_r")).toEqual({ "X-Refresh-Token": "jwt_r" });
    expect(refreshTokenHeaders(null)).toEqual({});
  });

  it("never uses the standard Authorization header for user tokens", () => {
    expect(Object.keys(accessTokenHeader("t"))).not.toContain("Authorization");
    expect(Object.keys(refreshTokenHeaders("t"))).not.toContain("Authorization");
  });
});

describe("environment detection", () => {
  it("isBrowser is false in plain node", () => {
    expect(isBrowser()).toBe(false);
  });

  it("isBrowser requires window.document.createElement", () => {
    vi.stubGlobal("window", {});
    expect(isBrowser()).toBe(false);
    vi.stubGlobal("window", { document: {} });
    expect(isBrowser()).toBe(false);
    vi.stubGlobal("window", { document: { createElement: () => ({}) } });
    expect(isBrowser()).toBe(true);
  });

  it("isWebauthnSupported is false outside a browser even if navigator looked capable", () => {
    expect(isWebauthnSupported()).toBe(false);
  });

  it("isWebauthnSupported is false in a browser without navigator.credentials", () => {
    vi.stubGlobal("window", { document: { createElement: () => ({}) } });
    vi.stubGlobal("navigator", {});
    expect(isWebauthnSupported()).toBe(false);
  });
});

describe("isValidDomain", () => {
  it.each([
    ["localhost", true],
    ["app.example.com", true],
    ["a-b.example.co", true],
    ["example", false],
    ["127.0.0.1", false],
    ["-bad.example.com", false],
  ])("%s -> %s", (host, expected) => {
    expect(isValidDomain(host)).toBe(expected);
  });
});

describe("Deferred", () => {
  it("exposes resolve and reject for an externally settled promise", async () => {
    const ok = new Deferred<number>();
    ok.resolve(7);
    await expect(ok.promise).resolves.toBe(7);

    const bad = new Deferred<number>();
    bad.reject(new Error("nope"));
    await expect(bad.promise).rejects.toThrow("nope");
  });
});
