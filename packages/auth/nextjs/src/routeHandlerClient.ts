import { ScuteCookieStorage, type CookieAttributes } from "@scute/core";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { createScuteClient, type ScuteNextjsClientConfig } from "./shared";

class ScuteNextRouteHandlerStorage extends ScuteCookieStorage {
  constructor(
    private readonly context: {
      cookies: () => ReadonlyRequestCookies;
    },
    defaultCookieOptions?: CookieAttributes
  ) {
    super(defaultCookieOptions);
  }

  protected getCookie(name: string): string | null {
    const nextCookies = this.context.cookies();
    return nextCookies.get(name)?.value ?? null;
  }

  protected setCookie(
    name: string,
    value: string,
    options?: CookieAttributes
  ): void {
    const nextCookies = this.context.cookies();
    nextCookies.set(name, value, options);
  }

  protected deleteCookie(name: string, options?: CookieAttributes): void {
    const nextCookies = this.context.cookies();
    nextCookies.set(name, "", {
      ...options,
      maxAge: 0,
    });
  }
}

export const createRouteHandlerClient = (
  context: {
    cookies: () => ReadonlyRequestCookies;
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
