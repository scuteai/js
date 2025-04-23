import { ScuteCookieStorage, type CookieAttributes } from "@scute/js-core";
import { splitCookiesString } from "set-cookie-parser";
import { parse as parseCookies, serialize as serializeCookie } from "cookie";
import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from "next";
import { createScuteClient, type ScuteNextjsClientConfig } from "./shared";

class ScuteNextServerStorage extends ScuteCookieStorage {
  constructor(
    private readonly context:
      | GetServerSidePropsContext
      | { req: NextApiRequest; res: NextApiResponse },
    defaultCookieOptions?: CookieAttributes
  ) {
    super(defaultCookieOptions);
  }

  protected getCookie(name: string): string | null {
    const setCookie = splitCookiesString(
      this.context.res.getHeader("set-cookie")?.toString() ?? ""
    )
      .map((c) => parseCookies(c)[name])
      .find((c) => !!c);

    const value = setCookie ?? this.context.req.cookies[name] ?? null;

    return value;
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
    const setCookies = splitCookiesString(
      this.context.res.getHeader("set-cookie")?.toString() ?? ""
    ).filter((c) => !(name in parseCookies(c)));

    const cookieStr = serializeCookie(name, value, {
      ...this.defaultCookieOptions,
      ...options,
    });

    this.context.res.setHeader("set-cookie", [...setCookies, cookieStr]);
  }
}

export const createPagesServerClient = (
  context:
    | GetServerSidePropsContext
    | { req: NextApiRequest; res: NextApiResponse },
  config?: ScuteNextjsClientConfig
) => {
  return createScuteClient({
    ...config,
    preferences: {
      ...config?.preferences,
      sessionStorageAdapter: new ScuteNextServerStorage(context, {
        secure: process.env.NODE_ENV === "production",
      }),
    },
  });
};
