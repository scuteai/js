/**
 * ScuteSession migration tests.
 *
 * Targets the three-property contract from the plan:
 *   1. read-after-write — value lands in namespaced slot
 *   2. legacy-read-through — only legacy set, returns it, forward-migrates
 *      into namespaced
 *   3. sign-out symmetry — both namespaced and legacy cleared
 *
 * Plus the multi-app isolation invariant — sign-out on app A leaves app B
 * untouched.
 *
 * The tests exercise the helpers via a minimal concrete subclass that
 * stubs every abstract member of ScuteSession. ScuteClient itself is the
 * production concrete subclass; this stub keeps the test free of HTTP and
 * broadcasting plumbing.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { ScuteSession } from "../ScuteSession";
import type { ScuteStorage } from "../ScuteStorage";
import { scopedKey, legacyKey } from "../storage-keys";

class TestStorage implements ScuteStorage {
  private map = new Map<string, string>();
  async getItem(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async removeItem(key: string): Promise<void> {
    this.map.delete(key);
  }
  // Test-only helpers
  raw() {
    return Object.fromEntries(this.map.entries());
  }
  seed(key: string, value: string) {
    this.map.set(key, value);
  }
}

// Test double exposing the otherwise-protected helpers without touching the
// network or BroadcastChannel.
class HarnessSession extends (ScuteSession as any) {
  appId: string;
  scuteStorage: TestStorage;
  config = { persistSession: true, autoRefreshToken: false } as any;
  admin = {} as any;

  constructor(appId: string, storage: TestStorage) {
    super();
    this.appId = appId;
    this.scuteStorage = storage;
  }

  // Surface the protected helpers for assertions.
  pubRead(kind: any) {
    return (this as any)._readNamespaced(kind);
  }
  pubWrite(kind: any, value: string) {
    return (this as any)._writeNamespaced(kind, value);
  }
  pubRemove(kind: any) {
    return (this as any)._removeNamespaced(kind);
  }

  // The rest of the abstract surface ScuteSession requires — stubs.
  // These don't get exercised in storage tests; they exist only so the
  // class is concrete enough to instantiate.
  protected getCurrentUser() {
    return Promise.resolve({ data: null, error: null }) as any;
  }
  protected _refreshRequest() {
    return Promise.resolve({ data: null, error: null }) as any;
  }
  protected emitAuthChangeEvent() {}
}

describe("ScuteSession storage namespacing", () => {
  let storage: TestStorage;
  let sessionA: HarnessSession;

  beforeEach(() => {
    storage = new TestStorage();
    sessionA = new HarnessSession("app_A", storage);
  });

  it("read-after-write lands in the namespaced slot, not the legacy slot", async () => {
    await sessionA.pubWrite("access", "tok_A");
    expect(storage.raw()).toEqual({
      [scopedKey("access", "app_A")]: "tok_A",
    });
    expect(await sessionA.pubRead("access")).toBe("tok_A");
  });

  it("legacy-read-through: namespaced miss falls back to legacy AND migrates forward", async () => {
    storage.seed(legacyKey("access"), "legacy_token");

    const value = await sessionA.pubRead("access");
    expect(value).toBe("legacy_token");

    // Forward-migrated into namespaced
    expect(await storage.getItem(scopedKey("access", "app_A"))).toBe("legacy_token");
    // Legacy left intact during v0.7 grace window (older tabs may still need it)
    expect(await storage.getItem(legacyKey("access"))).toBe("legacy_token");
  });

  it("when both slots are populated, namespaced wins (no clobber by legacy)", async () => {
    storage.seed(legacyKey("access"), "legacy_token");
    await sessionA.pubWrite("access", "new_token");

    const value = await sessionA.pubRead("access");
    expect(value).toBe("new_token");
  });

  it("sign-out clears BOTH namespaced and legacy for the same kind", async () => {
    storage.seed(legacyKey("access"), "legacy_token");
    await sessionA.pubWrite("access", "new_token");

    await sessionA.pubRemove("access");

    expect(await storage.getItem(scopedKey("access", "app_A"))).toBeNull();
    expect(await storage.getItem(legacyKey("access"))).toBeNull();
  });

  it("sign-out on app A does not touch app B's namespaced keys", async () => {
    const sessionB = new HarnessSession("app_B", storage);
    await sessionA.pubWrite("access", "tok_A");
    await sessionB.pubWrite("access", "tok_B");

    await sessionA.pubRemove("access");

    expect(await storage.getItem(scopedKey("access", "app_A"))).toBeNull();
    expect(await storage.getItem(scopedKey("access", "app_B"))).toBe("tok_B");
    expect(await sessionB.pubRead("access")).toBe("tok_B");
  });

  it("read on app B does not migrate the legacy key into app A's slot", async () => {
    storage.seed(legacyKey("access"), "shared_legacy");
    const sessionB = new HarnessSession("app_B", storage);

    await sessionB.pubRead("access");

    // The legacy value got copied into app_B's namespaced slot, NOT app_A's.
    expect(await storage.getItem(scopedKey("access", "app_B"))).toBe("shared_legacy");
    expect(await storage.getItem(scopedKey("access", "app_A"))).toBeNull();
  });

  it("covers every kind (access, refresh, cred, lastLogin, remember)", async () => {
    const kinds = ["access", "refresh", "cred", "lastLogin", "remember"] as const;
    for (const kind of kinds) {
      await sessionA.pubWrite(kind, `val_${kind}`);
      const read = await sessionA.pubRead(kind);
      expect(read).toBe(`val_${kind}`);
    }
    // 5 namespaced entries, no legacy
    expect(Object.keys(storage.raw()).length).toBe(5);
    for (const kind of kinds) {
      expect(storage.raw()[scopedKey(kind, "app_A")]).toBe(`val_${kind}`);
    }
  });

  it("legacy fallback returns null when neither slot is set", async () => {
    expect(await sessionA.pubRead("access")).toBeNull();
  });
});
