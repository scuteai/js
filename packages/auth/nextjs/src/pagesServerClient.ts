import { ScuteCookieStorage, type CookieAttributes } from "@scute/js-core";
import { splitCookiesString } from "set-cookie-parser";
import { parse as parseCookies, serialize as serializeCookie } from "cookie";
import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from "next";
import { createScuteClient, type ScuteNextjsClientConfig } from "./shared";
import { clientIpFor, writtenCookie } from "./utils";

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
    // the last write for this name wins; an empty value is a deletion
    const written = writtenCookie(this.context.res.getHeader("set-cookie"), name);
    if (written !== undefined) {
      return written;
    }

    return this.context.req.cookies[name] ?? null;
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
    // The address that connected to this server. Behind a proxy, pass
    // `clientIp` (see the README).
    clientIp: clientIpFor(config, context.req.socket?.remoteAddress),
    preferences: {
      ...config?.preferences,
      sessionStorageAdapter: new ScuteNextServerStorage(context, {
        secure: process.env.NODE_ENV === "production",
      }),
    },
  });
};
