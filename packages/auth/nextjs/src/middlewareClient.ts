import { ScuteCookieStorage, type CookieAttributes } from "@scute/js-core";
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
    const attributes = { ...this.defaultCookieOptions, ...options };
    const cookieStr = serializeCookie(name, value, attributes);

    if (this.context.res.headers) {
      this.context.res.headers.append("set-cookie", cookieStr);
      forwardCookieToRequest(
        this.context,
        name,
        attributes.maxAge === 0 ? null : cookieStr.split(";")[0]
      );
    }
  }
}

const OVERRIDE_HEADERS = "x-middleware-override-headers";
const REQUEST_HEADER = "x-middleware-request-";

/**
 * Makes a cookie write visible to the request Next renders after this
 * middleware (server components, route handlers), the same way
 * `NextResponse.next({ request: { headers } })` does: Next reads these
 * internal headers into the downstream request and strips them, so they are
 * not sent to the browser. `pair` is `name=value`, or null for a deletion.
 */
const forwardCookieToRequest = (
  { req, res }: { req: NextRequest; res: NextResponse },
  name: string,
  pair: string | null
) => {
  const overridden = res.headers.get(OVERRIDE_HEADERS);
  const keys = overridden
    ? overridden
        .split(",")
        .map((k) => k.trim())
        .filter((k) => !!k)
    : [];

  if (!overridden) {
    // overriding drops every request header that is not listed, so list
    // (and keep) all of them
    req.headers.forEach((value, key) => {
      keys.push(key);
      res.headers.set(REQUEST_HEADER + key, value);
    });
  }
  if (keys.indexOf("cookie") === -1) {
    keys.push("cookie");
  }

  const current =
    res.headers.get(REQUEST_HEADER + "cookie") ??
    req.headers.get("cookie") ??
    "";
  const pairs = current
    .split(";")
    .map((p) => p.trim())
    .filter((p) => !!p && p.split("=")[0].trim() !== name);
  if (pair) {
    pairs.push(pair);
  }

  res.headers.set(REQUEST_HEADER + "cookie", pairs.join("; "));
  res.headers.set(OVERRIDE_HEADERS, keys.join(","));
};

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
