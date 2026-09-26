import { ScuteCookieStorage, type CookieAttributes } from "@scute/js-core";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import type { NextRequest } from "next/server";
import { parse as parseCookies, serialize as serializeCookie } from "cookie";
import { splitCookiesString } from "set-cookie-parser";
import { createScuteClient, type ScuteNextjsClientConfig } from "./shared";

type PagesEdgeRuntimeContext = {
  request: NextRequest;
  /**
   * The response that will be sent to the browser (a `Response` or
   * `NextResponse`). Session cookies are written to it as `Set-Cookie`
   * headers. Without it, writes only update `request.cookies` for the rest
   * of this request and never reach the browser.
   */
  response?: { headers: Headers };
};

/** Value of `name` in a single Set-Cookie string, or undefined. */
const setCookieValue = (setCookie: string, name: string) =>
  parseCookies(setCookie.split(";")[0])[name] as string | undefined;

class ScuteNextPagesEdgeRuntimeStorage extends ScuteCookieStorage {
  constructor(
    private readonly context: PagesEdgeRuntimeContext,
    defaultCookieOptions?: CookieAttributes
  ) {
    super(defaultCookieOptions);
  }

  protected getCookie(name: string): string | null {
    const response = this.context.response;
    if (response) {
      // the last write for this name wins; an empty value is a deletion
      let written: string | undefined;
      for (const c of splitCookiesString(
        response.headers.get("set-cookie") ?? ""
      )) {
        written = setCookieValue(c, name) ?? written;
      }
      if (written !== undefined) {
        return written || null;
      }
    }

    const nextCookies = this.context.request.cookies;
    return nextCookies.get(name)?.value ?? null;
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
    const response = this.context.response;
    if (!response) {
      const nextCookies = this.context.request
        .cookies as unknown as ReadonlyRequestCookies;
      nextCookies.set(name, value, options);
      return;
    }

    // replace an earlier Set-Cookie for the same name, keep all others
    const others = splitCookiesString(
      response.headers.get("set-cookie") ?? ""
    ).filter((c) => setCookieValue(c, name) === undefined);

    response.headers.delete("set-cookie");
    for (const c of others) {
      response.headers.append("set-cookie", c);
    }
    response.headers.append(
      "set-cookie",
      serializeCookie(name, value, {
        ...this.defaultCookieOptions,
        ...options,
      })
    );
  }
}

export const createPagesEdgeRuntimeClient = (
  context: PagesEdgeRuntimeContext,
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
