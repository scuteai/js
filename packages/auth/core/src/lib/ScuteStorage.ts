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

const memoryStorage = new Map<string, string>();
export const ScuteMemoryStorage: ScuteStorage = {
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

export abstract class ScuteCookieStorage extends ScuteStorage {
  protected readonly defaultCookieOptions?: CookieAttributes;

  constructor(defaultCookieOptions?: CookieAttributes) {
    super();
    this.defaultCookieOptions = {
      path: "/",
      ...defaultCookieOptions,
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
