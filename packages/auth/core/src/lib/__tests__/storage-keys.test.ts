import { describe, expect, it } from "vitest";
import {
  scopedKey,
  legacyKey,
  scopedChannel,
  LEGACY_BROADCAST_CHANNEL,
} from "../storage-keys";

describe("storage-keys helper", () => {
  describe("scopedKey", () => {
    it("suffixes the canonical key with __<appId> for every kind", () => {
      expect(scopedKey("access", "app_abc")).toBe("sc-access-token__app_abc");
      expect(scopedKey("refresh", "app_abc")).toBe("sc-refresh-token__app_abc");
      expect(scopedKey("cred", "app_abc")).toBe("sct_cred_data__app_abc");
      expect(scopedKey("lastLogin", "app_abc")).toBe("sct_last_login__app_abc");
      expect(scopedKey("remember", "app_abc")).toBe("sc-remember-me__app_abc");
    });

    it("produces distinct keys for two different appIds (no collision)", () => {
      const a = scopedKey("access", "app_A");
      const b = scopedKey("access", "app_B");
      expect(a).not.toBe(b);
    });

    it("accepts numeric appIds (UniqueIdentifier is string | number)", () => {
      expect(scopedKey("access", 42)).toBe("sc-access-token__42");
    });

    it("throws on empty / null / undefined appId so silent collisions can't happen", () => {
      expect(() => scopedKey("access", "")).toThrow(/without an appId/);
      // @ts-expect-error — runtime guard for the typed-as-string slot
      expect(() => scopedKey("access", null)).toThrow(/without an appId/);
      // @ts-expect-error
      expect(() => scopedKey("access", undefined)).toThrow(/without an appId/);
    });

    it("uses '__' as separator (RFC 6265 token-safe)", () => {
      // ':' is an HTTP token separator and could be mangled by a strict
      // proxy. Lock this guarantee in case anyone changes it later.
      expect(scopedKey("access", "x").includes(":")).toBe(false);
      expect(scopedKey("access", "x").endsWith("__x")).toBe(true);
    });
  });

  describe("legacyKey", () => {
    it("returns the original unsuffixed string verbatim", () => {
      expect(legacyKey("access")).toBe("sc-access-token");
      expect(legacyKey("refresh")).toBe("sc-refresh-token");
      expect(legacyKey("cred")).toBe("sct_cred_data");
      expect(legacyKey("lastLogin")).toBe("sct_last_login");
      expect(legacyKey("remember")).toBe("sc-remember-me");
    });

    it("never returns a namespaced suffix (this is the legacy read path)", () => {
      expect(legacyKey("access").includes("__")).toBe(false);
    });
  });

  describe("scopedChannel", () => {
    it("returns a per-appId channel name", () => {
      expect(scopedChannel("app_abc")).toBe("sct_broadcast__app_abc");
    });

    it("differs across appIds", () => {
      expect(scopedChannel("app_A")).not.toBe(scopedChannel("app_B"));
    });

    it("throws on missing appId", () => {
      expect(() => scopedChannel("")).toThrow(/without an appId/);
    });
  });

  describe("LEGACY_BROADCAST_CHANNEL", () => {
    it("matches the prior global channel name", () => {
      expect(LEGACY_BROADCAST_CHANNEL).toBe("sct_broadcast");
    });
  });
});
