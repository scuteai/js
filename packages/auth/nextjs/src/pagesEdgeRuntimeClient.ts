import { ScuteCookieStorage, type CookieAttributes } from "@scute/js-core";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import type { NextRequest } from "next/server";
import { createScuteClient, type ScuteNextjsClientConfig } from "./shared";

class ScuteNextPagesEdgeRuntimeStorage extends ScuteCookieStorage {
  constructor(
    private readonly context: {
      request: NextRequest;
    },
    defaultCookieOptions?: CookieAttributes
  ) {
    super(defaultCookieOptions);
  }

  protected getCookie(name: string): string | null {
    const nextCookies = this.context.request.cookies;
    return nextCookies.get(name)?.value ?? null;
  }

  protected setCookie(
    name: string,
    value: string,
    options?: CookieAttributes
  ): void {
    const nextCookies = this.context.request
      .cookies as unknown as ReadonlyRequestCookies;
    nextCookies.set(name, value, options);
  }

  protected deleteCookie(name: string, options?: CookieAttributes): void {
    const nextCookies = this.context.request
      .cookies as unknown as ReadonlyRequestCookies;
    nextCookies.set(name, "", {
      ...options,
      maxAge: 0,
    });
  }
}

export const createPagesEdgeRuntimeClient = (
  context: {
    request: NextRequest;
  },
  config?: ScuteNextjsClientConfig
) => {
  return createScuteClient({
    ...config,
    preferences: {
      ...config?.preferences,
      sessionStorageAdapter: new ScuteNextPagesEdgeRuntimeStorage(
        context,
        {
          secure: process.env.NODE_ENV === "production",
        }
      ),
    },
  });
};
