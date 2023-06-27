import { ScuteCookieStorage, type CookieAttributes } from "@scute/react";
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
  const appId = config?.appId ?? process.env.NEXT_PUBLIC_SCUTE_APP_ID;
  const baseUrl = config?.baseUrl ?? process.env.NEXT_PUBLIC_SCUTE_BASE_URL;

  if (!appId) {
    throw new Error("either NEXT_PUBLIC_SCUTE_APP_ID or appId is required!");
  }

  return createScuteClient({
    ...config,
    appId,
    baseUrl,
    preferences: {
      ...config?.preferences,
      sessionStorageAdapter: new ScuteNextRouteHandlerStorage(context, {
        secure: process.env.NODE_ENV === "production",
      }),
    },
  });
};
