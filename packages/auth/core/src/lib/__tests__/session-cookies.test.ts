/**
 * Characterization of ScuteSession's cookie and storage paths: which keys
 * are written, with exactly which cookie attributes, how legacy keys are
 * migrated and removed, the credential store, and what the bundled
 * ScuteBrowserCookieStorage actually writes to document.cookie.
 *
 * Namespacing basics (read-after-write, legacy read-through, multi-app
 * isolation) live in scute-session-storage.test.ts and are not repeated.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../../ScuteClient";
import { ScuteCookieStorage } from "../ScuteStorage";
import ScuteBrowserCookieStorage from "../ScuteBrowserCookieStorage";
import type { CookieAttributes } from "../types/general";
import {
  accessToken,
  APP_ID,
  AUTH_PREFIX,
  BASE_URL,
  createServer,
  installBrowser,
  KEYS,
  nowSeconds,
  quietPreferences,
  refreshToken,
  userFixture,
  type TestServer,
} from "../../__tests__/harness";

class RecordingCookieStorage extends ScuteCookieStorage {
  readonly jar = new Map<string, string>();
  readonly writes: Array<{ name: string; value: string; options: CookieAttributes }> = [];
  readonly deletes: Array<{ name: string; options: CookieAttributes }> = [];
  failWrites = false;

  protected getCookie(name: string) {
    return this.jar.get(name) ?? null;
  }
  protected setCookie(name: string, value: string, options: CookieAttributes) {
    if (this.failWrites) throw new Error("cookie write refused");
    this.writes.push({ name, value, options });
    this.jar.set(name, value);
  }
  protected deleteCookie(name: string, options: CookieAttributes) {
    this.deletes.push({ name, options });
    this.jar.delete(name);
  }
  writeFor(name: string) {
    return this.writes.filter((w) => w.name === name);
  }
}

const FOUR_HUNDRED_DAYS_MS = 400 * 24 * 60 * 60 * 1000;

let server: TestServer;

const newClient = (storage: ScuteCookieStorage) =>
  createClient({
    appId: APP_ID,
    baseUrl: BASE_URL,
    preferences: { ...quietPreferences, sessionStorageAdapter: storage },
  });

beforeEach(() => {
  server = createServer();
  server.on("GET", `${AUTH_PREFIX}/current_user`, { body: { user: userFixture() } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cookies written on sign in (server side / node)", () => {
  it("writes access, refresh, then last-login with these exact attributes", async () => {
    const storage = new RecordingCookieStorage();
    const client = newClient(storage);
    const accessExp = nowSeconds() + 900;
    const refreshExp = nowSeconds() + 86400;
    const access = accessToken({ expiresIn: 900 });
    const refresh = refreshToken({ expiresIn: 86400 });

    const result = await client.signInWithTokenPayload({ access, refresh } as any);
    expect(result).toEqual({ error: null });

    expect(storage.writes.map((w) => w.name)).toEqual([
      KEYS.access,
      KEYS.refresh,
      KEYS.lastLogin,
    ]);
    expect(storage.writeFor(KEYS.access)[0]).toStrictEqual({
      name: KEYS.access,
      value: access,
      options: {
        path: "/",
        expires: new Date(accessExp * 1000),
        sameSite: "lax",
        httpOnly: false,
      },
    });
    expect(storage.writeFor(KEYS.refresh)[0]).toStrictEqual({
      name: KEYS.refresh,
      value: refresh,
      options: {
        path: "/",
        expires: new Date(refreshExp * 1000),
        sameSite: "lax",
        httpOnly: true,
      },
    });

    const lastLogin = storage.writeFor(KEYS.lastLogin)[0];
    expect(lastLogin.value).toBe("ada@example.com");
    expect(lastLogin.options).toMatchObject({ path: "/", sameSite: "strict" });
    expect(lastLogin.options.httpOnly).toBeUndefined();
    expect(
      Math.abs(lastLogin.options.expires!.getTime() - (Date.now() + FOUR_HUNDRED_DAYS_MS))
    ).toBeLessThan(5000);
  });

  // Known limitation, tracked separately: ScuteSession never sets `secure`
  // or `domain`; those come only from the adapter's defaultCookieOptions.
  it("never sets secure or domain itself", async () => {
    const storage = new RecordingCookieStorage();
    const client = newClient(storage);
    await client.signInWithTokenPayload({
      access: accessToken(),
      refresh: refreshToken(),
    } as any);

    for (const write of storage.writes) {
      expect(write.options.secure).toBeUndefined();
      expect(write.options.domain).toBeUndefined();
    }
  });

  it("merges adapter defaults into every write, with per-call attributes winning", async () => {
    const storage = new RecordingCookieStorage({
      secure: true,
      domain: ".app.test",
      sameSite: "none",
      path: "/auth",
    });
    const client = newClient(storage);
    await client.signInWithTokenPayload({
      access: accessToken(),
      refresh: refreshToken(),
    } as any);

    expect(storage.writeFor(KEYS.access)[0].options).toMatchObject({
      secure: true,
      domain: ".app.test",
      sameSite: "lax",
      path: "/",
    });
    expect(storage.writeFor(KEYS.lastLogin)[0].options).toMatchObject({
      secure: true,
      domain: ".app.test",
      sameSite: "strict",
    });
  });

  it("stores the phone number as last login when the user has no email", async () => {
    server.on("GET", `${AUTH_PREFIX}/current_user`, {
      body: { user: userFixture({ email: null, phone: "+15550001111" }) },
    });
    const storage = new RecordingCookieStorage();
    await newClient(storage).signInWithTokenPayload({ access: accessToken() } as any);
    expect(storage.jar.get(KEYS.lastLogin)).toBe("+15550001111");
  });

  it("a payload without a refresh token leaves any existing refresh cookie in place", async () => {
    const storage = new RecordingCookieStorage();
    storage.jar.set(KEYS.refresh, "old_refresh");
    await newClient(storage).signInWithTokenPayload({ access: accessToken() } as any);
    expect(storage.writeFor(KEYS.refresh)).toHaveLength(0);
    expect(storage.jar.get(KEYS.refresh)).toBe("old_refresh");
  });
});

describe("cookies written on sign in (browser)", () => {
  it("writes the refresh cookie with httpOnly: false in a browser", async () => {
    installBrowser();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = new RecordingCookieStorage();
    await newClient(storage).signInWithTokenPayload({
      access: accessToken(),
      refresh: refreshToken(),
    } as any);
    expect(storage.writeFor(KEYS.refresh)[0].options.httpOnly).toBe(false);
  });
});

describe("cookie removal", () => {
  it("sign out deletes namespaced and legacy access/refresh cookies with maxAge 0", async () => {
    const storage = new RecordingCookieStorage();
    storage.jar.set(KEYS.access, accessToken());
    storage.jar.set(KEYS.refresh, refreshToken());
    storage.jar.set(KEYS.legacyAccess, "legacy_a");
    storage.jar.set(KEYS.legacyRefresh, "legacy_r");
    server.on("DELETE", `${AUTH_PREFIX}/current_user`, { status: 200, body: {} });

    await newClient(storage).signOut();

    expect(storage.deletes.map((d) => d.name)).toEqual([
      KEYS.access,
      KEYS.legacyAccess,
      KEYS.refresh,
      KEYS.legacyRefresh,
    ]);
    expect(storage.deletes[0].options).toStrictEqual({
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 0,
    });
    expect(storage.deletes[2].options).toStrictEqual({
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 0,
    });
    expect(storage.jar.size).toBe(0);
  });

  it("sign out keeps the last-login and credential cookies", async () => {
    const storage = new RecordingCookieStorage();
    storage.jar.set(KEYS.access, accessToken());
    storage.jar.set(KEYS.lastLogin, "ada@example.com");
    storage.jar.set(KEYS.cred, JSON.stringify({ user_1: ["c1"] }));
    server.on("DELETE", `${AUTH_PREFIX}/current_user`, { status: 200, body: {} });

    await newClient(storage).signOut();

    expect(storage.jar.get(KEYS.lastLogin)).toBe("ada@example.com");
    expect(storage.jar.get(KEYS.cred)).toBeDefined();
  });

  it("clearRememberedIdentifier deletes namespaced and legacy last-login", async () => {
    const storage = new RecordingCookieStorage();
    storage.jar.set(KEYS.lastLogin, "ada@example.com");
    storage.jar.set(KEYS.legacyLastLogin, "old@example.com");
    const client = newClient(storage);

    expect(await client.getRememberedIdentifier()).toBe("ada@example.com");
    await client.clearRememberedIdentifier();
    expect(await client.getRememberedIdentifier()).toBeNull();
    expect(storage.deletes.map((d) => d.name)).toEqual([KEYS.lastLogin, KEYS.legacyLastLogin]);
    // the delete carries both a 400 day expires and maxAge 0
    expect(storage.deletes[0].options).toMatchObject({ sameSite: "strict", maxAge: 0 });
    expect(storage.deletes[0].options.expires).toBeInstanceOf(Date);
  });
});

describe("legacy key migration on read", () => {
  it("copies a legacy access cookie into the namespaced slot without an expiry", async () => {
    const storage = new RecordingCookieStorage();
    const legacy = accessToken();
    storage.jar.set(KEYS.legacyAccess, legacy);

    const { data } = await newClient(storage).getAuthToken();
    expect(data?.access).toBe(legacy);

    // The migrated copy becomes a session cookie: no `expires` is passed.
    expect(storage.writeFor(KEYS.access)).toStrictEqual([
      {
        name: KEYS.access,
        value: legacy,
        options: { path: "/", sameSite: "lax", httpOnly: false },
      },
    ]);
    expect(storage.jar.get(KEYS.legacyAccess)).toBe(legacy);
  });

  it("a failing migration write does not break the read", async () => {
    const storage = new RecordingCookieStorage();
    const legacy = accessToken();
    storage.jar.set(KEYS.legacyAccess, legacy);
    storage.failWrites = true;

    const { data, error } = await newClient(storage).getAuthToken();
    expect(error).toBeNull();
    expect(data?.access).toBe(legacy);
  });
});

describe("credential store", () => {
  it("revokeSession with a credential id removes it from the store (strict, 400 days)", async () => {
    const storage = new RecordingCookieStorage();
    storage.jar.set(KEYS.access, accessToken({ uuid: "user_1" }));
    storage.jar.set(KEYS.cred, JSON.stringify({ user_1: ["c1", "c2"], user_2: ["c9"] }));
    server.on("DELETE", `${AUTH_PREFIX}/sessions/s_1`, { status: 200, body: {} });

    await newClient(storage).revokeSession("s_1", "c1");

    const write = storage.writeFor(KEYS.cred)[0];
    expect(JSON.parse(write.value)).toEqual({ user_1: ["c2"], user_2: ["c9"] });
    expect(write.options).toMatchObject({ path: "/", sameSite: "strict" });
    expect(
      Math.abs(write.options.expires!.getTime() - (Date.now() + FOUR_HUNDRED_DAYS_MS))
    ).toBeLessThan(5000);
  });

  it("a corrupted credential store is treated as empty", async () => {
    const storage = new RecordingCookieStorage();
    storage.jar.set(KEYS.access, accessToken({ uuid: "user_1" }));
    storage.jar.set(KEYS.cred, "{not json");
    server.on("DELETE", `${AUTH_PREFIX}/sessions/s_1`, { status: 200, body: {} });

    await newClient(storage).revokeSession("s_1", "c1");
    expect(JSON.parse(storage.jar.get(KEYS.cred)!)).toEqual({ user_1: [] });
  });

  it("in a browser, the store falls back to localStorage and is mirrored there on write", async () => {
    const { localStorage } = installBrowser();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(KEYS.legacyCred, JSON.stringify({ user_1: ["c1", "c2"] }));
    const storage = new RecordingCookieStorage();
    storage.jar.set(KEYS.access, accessToken({ uuid: "user_1" }));
    server.on("DELETE", `${AUTH_PREFIX}/sessions/s_1`, { status: 200, body: {} });

    await newClient(storage).revokeSession("s_1", "c2");

    expect(JSON.parse(localStorage.getItem(KEYS.cred)!)).toEqual({ user_1: ["c1"] });
    expect(JSON.parse(storage.jar.get(KEYS.cred)!)).toEqual({ user_1: ["c1"] });
  });
});

describe("ScuteBrowserCookieStorage (js-cookie) document.cookie output", () => {
  let writes: string[];
  let jar: Map<string, string>;

  beforeEach(() => {
    writes = [];
    jar = new Map();
    vi.stubGlobal("document", {
      get cookie() {
        return Array.from(jar.entries())
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");
      },
      set cookie(str: string) {
        writes.push(str);
        const [pair, ...attrs] = str.split("; ");
        const eq = pair.indexOf("=");
        const expires = attrs.find((a) => a.toLowerCase().startsWith("expires="));
        if (expires && new Date(expires.slice(8)).getTime() < Date.now()) {
          jar.delete(pair.slice(0, eq));
        } else {
          jar.set(pair.slice(0, eq), pair.slice(eq + 1));
        }
      },
    });
  });

  it("writes path, expires and sameSite, and drops httpOnly: false", async () => {
    const storage = new ScuteBrowserCookieStorage();
    const expires = new Date(Date.UTC(2030, 0, 1));
    await storage.setItem(KEYS.access, "a.b.c", {
      expires,
      sameSite: "lax",
      httpOnly: false,
      path: "/",
    });
    expect(writes).toEqual([
      `${KEYS.access}=a.b.c; path=/; expires=${expires.toUTCString()}; sameSite=lax`,
    ]);
    expect(await storage.getItem(KEYS.access)).toBe("a.b.c");
  });

  it("has no Secure flag unless the adapter was constructed with secure: true", async () => {
    await new ScuteBrowserCookieStorage().setItem("k", "v");
    await new ScuteBrowserCookieStorage({ secure: true }).setItem("k2", "v");
    expect(writes[0]).not.toMatch(/secure/i);
    expect(writes[1]).toBe("k2=v; path=/; secure");
  });

  it("serializes httpOnly: true as a bare flag, which document.cookie cannot honour", async () => {
    await new ScuteBrowserCookieStorage().setItem("k", "v", { httpOnly: true });
    expect(writes[0]).toBe("k=v; path=/; httpOnly");
  });

  it("removeItem writes an already expired cookie with the same path", async () => {
    const storage = new ScuteBrowserCookieStorage();
    await storage.setItem("k", "v");
    await storage.removeItem("k", { sameSite: "lax" });
    expect(writes[1]).toMatch(/^k=; path=\/; sameSite=lax; expires=/);
    expect(await storage.getItem("k")).toBeNull();
  });
});
