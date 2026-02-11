import { ScuteCookieStorage, type CookieAttributes } from "@scute/js-core";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { createScuteClient, type ScuteNextjsClientConfig } from "./shared";
import type { Promisable } from "./utils";

class ScuteNextServerComponentStorage extends ScuteCookieStorage {
  constructor(
    private readonly context: {
      cookies: () => Promisable<ReadonlyRequestCookies>;
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
    cookies: () => Promisable<ReadonlyRequestCookies>;
  },
  config?: ScuteNextjsClientConfig
) => {
  const scuteClient = createScuteClient({
    ...config,
    preferences: {
      ...config?.preferences,
      // server components does not support refreshing
      autoRefreshToken: false,
      sessionStorageAdapter: new ScuteNextServerComponentStorage(context, {
        secure: process.env.NODE_ENV === "production",
      }),
    },
  });

  return scuteClient;
};
