import Cookies from "js-cookie";
import { ScuteCookieStorage } from "./ScuteStorage";
import type { CookieAttributes } from "./types/general";
class ScuteBrowserCookieStorage extends ScuteCookieStorage {
  protected getCookie(name: string): string | null {
    return Cookies.get(name) ?? null;
  }
  protected setCookie(
    name: string,
    value: string,
    cookieOptions: CookieAttributes
  ): void {
    Cookies.set(name, value, cookieOptions);
  }
  protected deleteCookie(name: string, cookieOptions: CookieAttributes): void {
    Cookies.remove(name, cookieOptions);
  }
}

export default ScuteBrowserCookieStorage;
