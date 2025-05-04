import { ScuteCookieStorage, type CookieAttributes } from "@scute/js-core";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { createScuteClient, type ScuteNextjsClientConfig } from "./shared";

class ScuteNextRouteHandlerStorage extends ScuteCookieStorage {
  constructor(
    private readonly context: {
      cookies: () => ReadonlyRequestCookies | Promise<ReadonlyRequestCookies>;
    },
    defaultCookieOptions?: CookieAttributes
  ) {
    super(defaultCookieOptions);
  }

  protected async getCookie(name: string): Promise<string | null> {
    const nextCookies = await Promise.resolve(this.context.cookies());
    return nextCookies.get(name)?.value ?? null;
  }

  protected async setCookie(
    name: string,
    value: string,
    options?: CookieAttributes
  ): Promise<void> {
    const nextCookies = await Promise.resolve(this.context.cookies());
    nextCookies.set(name, value, options);
  }

  protected async deleteCookie(
    name: string,
    options?: CookieAttributes
  ): Promise<void> {
    const nextCookies = await Promise.resolve(this.context.cookies());
    nextCookies.set(name, "", {
      ...options,
      maxAge: 0,
    });
  }
}

export const createRouteHandlerClient = (
  context: {
    cookies: () => ReadonlyRequestCookies | Promise<ReadonlyRequestCookies>;
  },
  config?: ScuteNextjsClientConfig
) => {
  return createScuteClient({
    ...config,
    preferences: {
      ...config?.preferences,
      sessionStorageAdapter: new ScuteNextRouteHandlerStorage(context, {
        secure: process.env.NODE_ENV === "production",
      }),
    },
  });
};
