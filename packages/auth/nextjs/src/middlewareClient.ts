import { ScuteCookieStorage, type CookieAttributes } from "@scute/core";
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
    const cookieStr = serializeCookie(name, value, {
      ...this.defaultCookieOptions,
      ...options,
    });

    if (this.context.res.headers) {
      this.context.res.headers.append("set-cookie", cookieStr);
      this.context.res.headers.append("cookie", cookieStr);
    }
  }
}

export const createMiddlewareClient = (
  context: { req: NextRequest; res: NextResponse },
  config?: ScuteNextjsClientConfig
) => {
  return createScuteClient({
    ...config,
    preferences: {
      ...config?.preferences,
      sessionStorageAdapter: new ScuteNextMiddlewareStorage(context, {
        secure: process.env.NODE_ENV === "production",
      }),
    },
  });
};
