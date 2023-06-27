import { ScuteCookieStorage, type CookieAttributes } from "@scute/react";
import type { NextRequest, NextResponse } from "next/server";
import { parse as parseCookies, serialize as serializeCookie } from "cookie";
import { splitCookiesString } from "set-cookie-parser";
import { createScuteClient, type ScuteNextjsClientConfig } from "./shared";

class ScuteNextMiddlewareStorage extends ScuteCookieStorage {
  constructor(
    private readonly context: { req: NextRequest; res: NextResponse },
    defaultCookieOptions?: CookieAttributes
  ) {
    super(defaultCookieOptions);
  }

  protected getCookie(name: string): string | null {
    const setCookie = splitCookiesString(
      this.context.res.headers.get("set-cookie")?.toString() ?? ""
    )
      .map((c) => parseCookies(c)[name])
      .find((c) => !!c);

    if (setCookie) {
      return setCookie;
    }

    const cookies = parseCookies(this.context.req.headers.get("cookie") ?? "");
    return cookies[name];
  }
  protected setCookie(
    name: string,
    value: string,
    options?: CookieAttributes
  ): void {
    this._setCookie(name, value, options);
  }
  protected deleteCookie(name: string, options?: CookieAttributes): void {
    this._setCookie(name, "", {
      ...options,
      maxAge: 0,
    });
  }

  private _setCookie(name: string, value: string, options?: CookieAttributes) {
    const newSessionStr = serializeCookie(name, value, {
      ...this.defaultCookieOptions,
      ...options,
    });

    if (this.context.res.headers) {
      this.context.res.headers.append("set-cookie", newSessionStr);
      this.context.res.headers.append("cookie", newSessionStr);
    }
  }
}

export const createMiddlewareClient = (
  context: { req: NextRequest; res: NextResponse },
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
      sessionStorageAdapter: new ScuteNextMiddlewareStorage(context, {
        secure: process.env.NODE_ENV === "production",
      }),
    },
  });
};
