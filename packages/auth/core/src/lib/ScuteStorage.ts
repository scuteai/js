import type { CookieAttributes, Promisable } from "./types/general";

export interface ScuteStorageInferface {
  getItem: (key: string) => Promisable<string | null>;
  setItem: (key: string, value: string) => Promisable<void>;
  removeItem: (key: string) => Promisable<void>;
}

export abstract class ScuteStorage implements ScuteStorageInferface {
  abstract getItem(key: string): Promisable<string | null>;
  abstract setItem(key: string, value: string): Promisable<void>;
  abstract removeItem(key: string): Promisable<void>;
}

/**
 * In-memory storage. Every call returns a new, empty store, so each
 * ScuteClient keeps its own tokens (two clients in one server process never
 * see each other's session).
 */
export const createMemoryStorage = (): ScuteStorage => {
  const memoryStorage = new Map<string, string>();
  return {
    async getItem(key) {
      return memoryStorage.get(key) ?? null;
    },
    async setItem(key, value) {
      memoryStorage.set(key, value);
    },
    async removeItem(key) {
      memoryStorage.delete(key);
    },
  };
};

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];

/** Cookies are Secure by default; only http://localhost pages go without. */
const defaultSecure = (): boolean => {
  try {
    const loc = typeof window !== "undefined" ? window.location : undefined;
    if (!loc) return true;
    const local = LOCAL_HOSTS.includes(loc.hostname) || loc.hostname.endsWith(".localhost");
    return !(loc.protocol === "http:" && local);
  } catch {
    return true;
  }
};

export abstract class ScuteCookieStorage extends ScuteStorage {
  protected readonly defaultCookieOptions?: CookieAttributes;

  constructor(defaultCookieOptions?: CookieAttributes) {
    super();
    this.defaultCookieOptions = {
      path: "/",
      ...defaultCookieOptions,
      // Secure unless the adapter says otherwise, or the page is plain
      // http on localhost (local development).
      secure: defaultCookieOptions?.secure ?? defaultSecure(),
    };
  }

  protected abstract getCookie(
    name: string
  ): Promisable<string | null> | string | null;
  protected abstract setCookie(
    name: string,
    value: string,
    cookieOptions: CookieAttributes
  ): Promisable<void>;
  protected abstract deleteCookie(
    name: string,
    cookieOptions: CookieAttributes
  ): Promisable<void>;

  async getItem(key: string): Promise<string | null> {
    return this.getCookie(key);
  }

  async setItem(
    key: string,
    value: string,
    cookieOptions?: CookieAttributes
  ): Promise<void> {
    await this.setCookie(key, value, {
      ...this.defaultCookieOptions,
      ...cookieOptions,
    });
  }

  async removeItem(
    key: string,
    cookieOptions?: CookieAttributes
  ): Promise<void> {
    await this.deleteCookie(key, {
      ...this.defaultCookieOptions,
      ...cookieOptions,
      maxAge: 0,
    });
  }
}
