import {
  isBrowser,
  ScuteCookieStorage,
  type CookieAttributes,
} from "@scute/core";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { createScuteClient, type ScuteNextjsClientConfig } from "./shared";

class ScuteNextServerComponentStorage extends ScuteCookieStorage {
  constructor(
    private readonly context: {
      cookies: () => ReadonlyRequestCookies;
    },
    defaultCookieOptions?: CookieAttributes
  ) {
    super(defaultCookieOptions);
  }

  protected async getCookie(name: string): Promise<string | null> {
    const nextCookies = await this.context.cookies();
    return nextCookies.get(name)?.value ?? null;
  }

  protected setCookie(
    name: string,
    value: string,
    cookieOptions?: CookieAttributes
  ): void {
    // https://github.com/vercel/next.js/discussions/41745#discussioncomment-5198848
  }
  protected deleteCookie(name: string, cookieOptions?: CookieAttributes): void {
    // https://github.com/vercel/next.js/discussions/41745#discussioncomment-5198848
  }
}

export const createServerComponentClient = (
  context: {
    cookies: () => ReadonlyRequestCookies;
  },
  config?: ScuteNextjsClientConfig
) => {
  const browser = isBrowser();
  const scuteClient = createScuteClient(
    {
      ...config,
      preferences: {
        ...config?.preferences,
        sessionStorageAdapter: new ScuteNextServerComponentStorage(context, {
          secure: process.env.NODE_ENV === "production",
        }),
      },
    },
    function onBeforeInitialize() {
      this["config"].autoRefreshToken = browser
        ? this["config"].autoRefreshToken
        : false;
    }
  );

  return scuteClient;
};
