import {
  CSRF_HANDLER,
  CSRF_TOKEN_KEY,
  CSRF_TOKEN_KEY_LEGACY,
  csrfCookieKey,
  internalPrefix,
  REFRESH_HANDLER,
  SIGN_IN_HANDLER,
  SIGN_OUT_HANDLER,
} from "../constants";
import * as handlerIndex from "../index";

describe("handler/constants", () => {
  it("pins the route segment names the client and server agree on", () => {
    expect(internalPrefix).toBe("auth");
    expect(CSRF_HANDLER).toBe("csrf");
    expect(REFRESH_HANDLER).toBe("refresh");
    expect(SIGN_IN_HANDLER).toBe("sign-in");
    expect(SIGN_OUT_HANDLER).toBe("sign-out");
  });

  it("uses a plain, un-namespaced header name for the CSRF token", () => {
    expect(CSRF_TOKEN_KEY).toBe("X-CSRF-Token");
  });

  it("keeps the legacy cookie name identical to the header name", () => {
    expect(CSRF_TOKEN_KEY_LEGACY).toBe("X-CSRF-Token");
    expect(CSRF_TOKEN_KEY_LEGACY).toBe(CSRF_TOKEN_KEY);
  });

  describe("csrfCookieKey", () => {
    it("suffixes the cookie name with __<appId>", () => {
      expect(csrfCookieKey("app-123")).toBe("X-CSRF-Token__app-123");
    });

    it("accepts numeric app ids", () => {
      expect(csrfCookieKey(42)).toBe("X-CSRF-Token__42");
    });

    it("gives different apps different cookie names", () => {
      expect(csrfCookieKey("a")).not.toBe(csrfCookieKey("b"));
    });

    it("throws for an empty string appId", () => {
      expect(() => csrfCookieKey("")).toThrow(
        "csrfCookieKey called without an appId"
      );
    });

    // Known limitation, tracked separately: the guard is a falsy check, so
    // a numeric appId 0 is rejected too.
    it("throws for numeric appId 0 (falsy guard)", () => {
      expect(() => csrfCookieKey(0)).toThrow(
        "csrfCookieKey called without an appId"
      );
    });

    it("throws for undefined / null", () => {
      expect(() => csrfCookieKey(undefined as any)).toThrow();
      expect(() => csrfCookieKey(null as any)).toThrow();
    });

    it("does not sanitize the appId (it is pasted into the cookie name verbatim)", () => {
      expect(csrfCookieKey("a b;c")).toBe("X-CSRF-Token__a b;c");
    });
  });

  it("re-exports the handler names and helpers from handler/index", () => {
    expect(handlerIndex.CSRF_HANDLER).toBe("csrf");
    expect(handlerIndex.REFRESH_HANDLER).toBe("refresh");
    expect(handlerIndex.SIGN_IN_HANDLER).toBe("sign-in");
    expect(handlerIndex.SIGN_OUT_HANDLER).toBe("sign-out");
    expect(typeof handlerIndex.fetchWithCsrf).toBe("function");
    expect(typeof handlerIndex.ScuteHandler).toBe("function");
  });
});
