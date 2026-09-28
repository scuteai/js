import {
  createCsrfToken,
  deleteCsrfToken,
  getCsrfErrorResponse,
  isCsrfTokenValid,
  setCsrfToken,
  timingSafeEqual,
} from "../csrf";

const APP = "app-123";
const NS = `X-CSRF-Token__${APP}`;
const LEGACY = "X-CSRF-Token";

const hdrs = (token?: string | null) => {
  const h = new Headers();
  if (token !== undefined && token !== null) h.set("X-CSRF-Token", token);
  return h;
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createCsrfToken", () => {
  it("returns 64 random bytes as 128 lowercase hex chars", () => {
    const t = createCsrfToken();
    expect(t).toMatch(/^[0-9a-f]{128}$/);
  });

  it("returns a different token on every call", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => createCsrfToken()));
    expect(tokens.size).toBe(50);
  });
});

describe("setCsrfToken", () => {
  it("sets the namespaced cookie and clears the legacy one (non-production)", () => {
    const res = new Response("x");
    setCsrfToken("tok123", res, APP);

    expect(res.headers.getSetCookie()).toEqual([
      `${NS}=tok123; Path=/; HttpOnly; SameSite=Lax`,
      `${LEGACY}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
    ]);
  });

  it("adds Secure to both cookies when NODE_ENV=production (read at call time)", () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = new Response("x");
    setCsrfToken("tok123", res, APP);

    expect(res.headers.getSetCookie()).toEqual([
      `${NS}=tok123; Path=/; HttpOnly; Secure; SameSite=Lax`,
      `${LEGACY}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`,
    ]);
  });

  it("writes the cookie only as Set-Cookie (no response `cookie` header)", () => {
    const res = new Response("x");
    setCsrfToken("tok123", res, APP);
    expect(res.headers.get("cookie")).toBeNull();
  });

  it("percent-encodes the token value so it cannot inject cookie attributes", () => {
    const res = new Response("x");
    setCsrfToken("a; Domain=evil.example\r\nSet-Cookie: x=1", res, APP);
    const [first, second] = res.headers.getSetCookie();
    expect(first).toBe(
      `${NS}=a%3B%20Domain%3Devil.example%0D%0ASet-Cookie%3A%20x%3D1; Path=/; HttpOnly; SameSite=Lax`
    );
    expect(second.startsWith(`${LEGACY}=;`)).toBe(true);
    expect(res.headers.getSetCookie()).toHaveLength(2);
  });

  it("throws when appId is missing (csrfCookieKey guard)", () => {
    expect(() => setCsrfToken("t", new Response("x"), "")).toThrow(
      "csrfCookieKey called without an appId"
    );
  });
});

describe("deleteCsrfToken", () => {
  it("expires both the namespaced and the legacy cookie", () => {
    const res = new Response(null);
    deleteCsrfToken(res, APP);
    expect(res.headers.getSetCookie()).toEqual([
      `${NS}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
      `${LEGACY}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
    ]);
    expect(res.headers.get("cookie")).toBeNull();
  });

  it("adds Secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = new Response(null);
    deleteCsrfToken(res, APP);
    for (const c of res.headers.getSetCookie()) {
      expect(c).toContain("; HttpOnly; Secure; SameSite=Lax");
    }
  });
});

describe("isCsrfTokenValid", () => {
  it("accepts a matching namespaced cookie and header (double submit)", () => {
    expect(
      isCsrfTokenValid({ cookies: { [NS]: "abc" }, headers: hdrs("abc"), appId: APP })
    ).toBe(true);
  });

  it("reads the header case-insensitively", () => {
    const h = new Headers({ "x-csrf-token": "abc" });
    expect(isCsrfTokenValid({ cookies: { [NS]: "abc" }, headers: h, appId: APP })).toBe(true);
  });

  it("rejects when the header is missing", () => {
    expect(isCsrfTokenValid({ cookies: { [NS]: "abc" }, headers: hdrs(), appId: APP })).toBe(false);
  });

  it("rejects when the cookie is missing", () => {
    expect(isCsrfTokenValid({ cookies: {}, headers: hdrs("abc"), appId: APP })).toBe(false);
  });

  it("rejects a mismatched token", () => {
    expect(
      isCsrfTokenValid({ cookies: { [NS]: "abc" }, headers: hdrs("abd"), appId: APP })
    ).toBe(false);
  });

  it("rejects empty and whitespace-only tokens even when they match", () => {
    expect(isCsrfTokenValid({ cookies: { [NS]: "" }, headers: hdrs(""), appId: APP })).toBe(false);
    expect(isCsrfTokenValid({ cookies: { [NS]: "   " }, headers: hdrs("   "), appId: APP })).toBe(false);
  });

  it("compares exactly: surrounding whitespace in the header is trimmed by Headers, not by the check", () => {
    // Headers normalizes leading/trailing whitespace, so " abc " becomes "abc".
    expect(isCsrfTokenValid({ cookies: { [NS]: "abc" }, headers: hdrs(" abc "), appId: APP })).toBe(true);
    // ...but whitespace stored in the cookie value is compared as-is.
    expect(isCsrfTokenValid({ cookies: { [NS]: " abc" }, headers: hdrs("abc"), appId: APP })).toBe(false);
  });

  it("is case-sensitive on the token value", () => {
    expect(isCsrfTokenValid({ cookies: { [NS]: "ABC" }, headers: hdrs("abc"), appId: APP })).toBe(false);
  });

  it("rejects when the request carries two X-CSRF-Token headers (joined value never matches)", () => {
    const h = new Headers();
    h.append("X-CSRF-Token", "abc");
    h.append("X-CSRF-Token", "abc");
    expect(h.get("X-CSRF-Token")).toBe("abc, abc");
    expect(isCsrfTokenValid({ cookies: { [NS]: "abc" }, headers: h, appId: APP })).toBe(false);
  });

  it("does not accept another app's namespaced cookie", () => {
    expect(
      isCsrfTokenValid({
        cookies: { "X-CSRF-Token__other-app": "abc" },
        headers: hdrs("abc"),
        appId: APP,
      })
    ).toBe(false);
  });

  // Known limitation, tracked separately (REF-41): the legacy unsuffixed
  // cookie is still accepted as the CSRF secret for any appId.
  it("falls back to the legacy unsuffixed cookie when the namespaced one is absent", () => {
    expect(
      isCsrfTokenValid({ cookies: { [LEGACY]: "abc" }, headers: hdrs("abc"), appId: APP })
    ).toBe(true);
  });

  it("prefers the namespaced cookie: a mismatched namespaced cookie is not rescued by a matching legacy one", () => {
    expect(
      isCsrfTokenValid({
        cookies: { [NS]: "zzz", [LEGACY]: "abc" },
        headers: hdrs("abc"),
        appId: APP,
      })
    ).toBe(false);
  });

  it("an empty namespaced cookie does NOT fall through to legacy (?? only skips null/undefined)", () => {
    expect(
      isCsrfTokenValid({
        cookies: { [NS]: "", [LEGACY]: "abc" },
        headers: hdrs("abc"),
        appId: APP,
      })
    ).toBe(false);
  });

  it("a null namespaced cookie DOES fall through to legacy", () => {
    expect(
      isCsrfTokenValid({
        cookies: { [NS]: null, [LEGACY]: "abc" },
        headers: hdrs("abc"),
        appId: APP,
      })
    ).toBe(true);
  });

  it("rejects a strict prefix of the token", () => {
    expect(
      isCsrfTokenValid({ cookies: { [NS]: "abcdef" }, headers: hdrs("abc"), appId: APP })
    ).toBe(false);
  });

  it("compares every character even when the first one differs (no early exit)", () => {
    const cookie = "a" + "x".repeat(127);
    const headers = hdrs("b" + "x".repeat(127));
    const charCodeAt = vi.spyOn(String.prototype, "charCodeAt");
    try {
      expect(isCsrfTokenValid({ cookies: { [NS]: cookie }, headers, appId: APP })).toBe(false);
      // two reads per character position
      expect(charCodeAt.mock.calls.length).toBeGreaterThanOrEqual(256);
    } finally {
      charCodeAt.mockRestore();
    }
  });

  it("throws (rather than returning false) when appId is empty", () => {
    expect(() =>
      isCsrfTokenValid({ cookies: { [LEGACY]: "abc" }, headers: hdrs("abc"), appId: "" })
    ).toThrow("csrfCookieKey called without an appId");
  });
});

describe("timingSafeEqual", () => {
  it("is true only for identical strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "Abc")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("abcd", "abc")).toBe(false);
    expect(timingSafeEqual("\u00e9", "e\u0301")).toBe(false);
  });
});

describe("getCsrfErrorResponse", () => {
  it("is a 401 with a plain-text 'CSRF error' body", async () => {
    const res = getCsrfErrorResponse();
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("CSRF error");
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});
