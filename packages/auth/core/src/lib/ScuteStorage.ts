import type { CookieAttributes } from "./types/general";

export interface ScuteStorageInferface {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

export abstract class ScuteStorage implements ScuteStorageInferface {
  abstract getItem(key: string): Promise<string | null>;
  abstract setItem(key: string, value: string): Promise<void>;
  abstract removeItem(key: string): Promise<void>;
}

const memoryStorage = new Map<string, any>();
export const ScuteNoneStorage: ScuteStorage = {
  async getItem(key) {
    return memoryStorage.get(key);
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
  ): Promise<string | null> | string | null;
  protected abstract setCookie(
    name: string,
    value: string,
    cookieOptions: CookieAttributes
  ): void;
  protected abstract deleteCookie(
    name: string,
    cookieOptions: CookieAttributes
  ): void;

  async getItem(key: string): Promise<string | null> {
    return this.getCookie(key);
  }

  async setItem(
    key: string,
    value: string,
    cookieOptions?: CookieAttributes
  ): Promise<void> {
    this.setCookie(key, value, {
      ...this.defaultCookieOptions,
      ...cookieOptions,
    });
  }

  async removeItem(
    key: string,
    cookieOptions?: CookieAttributes
  ): Promise<void> {
    this.deleteCookie(key, {
      ...this.defaultCookieOptions,
      ...cookieOptions,
      maxAge: 0,
    });
  }
}
