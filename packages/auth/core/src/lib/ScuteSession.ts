import jwtDecode from "jwt-decode";
import { ScuteCookieStorage, ScuteStorage } from "./ScuteBaseStorage";
import {
  SCUTE_ACCESS_STORAGE_KEY,
  SCUTE_CSRF_STORAGE_KEY,
  SCUTE_REFRESH_STORAGE_KEY,
  SCUTE_USER_STORAGE_KEY,
} from "./constants";
import type {
  UniqueIdentifier,
  Session,
  ScuteSessionConfig,
  ScuteTokenPayloadUser,
} from "./types";
import { isBrowser } from "./helpers";

export class ScuteSession {
  protected appId: UniqueIdentifier;
  protected scuteStorage: ScuteStorage | ScuteCookieStorage;

  constructor(config: ScuteSessionConfig) {
    this.appId = config.appId;
    this.scuteStorage = config.storage;
  }

  private get isCookieStorage() {
    return this.scuteStorage instanceof ScuteCookieStorage;
  }

  async initialState(): Promise<Session> {
    const browser = isBrowser();

    const access = await this.scuteStorage.getItem(SCUTE_ACCESS_STORAGE_KEY);
    const refresh = await this.scuteStorage.getItem(SCUTE_REFRESH_STORAGE_KEY);
    const user = await this.getRememberedUser();
    const csrf = await this.scuteStorage.getItem(SCUTE_CSRF_STORAGE_KEY);

    if (!access || (!refresh && !browser) || !csrf) {
      await this.removeSession();
      return ScuteSession.unAuthenticatedState();
    }

    const { exp: accessExpiresAt } = jwtDecode(access) as any;
    const { exp: refreshExpiresAt } =
      !browser && refresh ? (jwtDecode(refresh) as any) : ({} as any);

    return {
      access,
      accessExpiresAt: accessExpiresAt
        ? new Date(accessExpiresAt * 1000)
        : null,
      refresh,
      refreshExpiresAt: refreshExpiresAt
        ? new Date(refreshExpiresAt * 1000)
        : null,
      csrf,
      user,
      status: "authenticated",
    };
  }

  async sync(session: Session | null): Promise<void> {
    if (
      !session ||
      !session.access ||
      (!session.refresh && !isBrowser()) ||
      !session.user ||
      !session.csrf ||
      session.status === "unauthenticated"
    ) {
      this.removeSession();
    } else {
      this.saveSession(session);
    }
  }

  async removeSession(): Promise<void> {
    const browser = isBrowser();

    this.scuteStorage.removeItem(SCUTE_ACCESS_STORAGE_KEY, {
      httpOnly: !browser ? false : undefined,
    });
    this.scuteStorage.removeItem(SCUTE_REFRESH_STORAGE_KEY, {
      httpOnly: !browser ? true : undefined,
    });
    // this.scuteStorage.removeItem(SCUTE_USER_STORAGE_KEY);
    this.scuteStorage.removeItem(SCUTE_CSRF_STORAGE_KEY, {
      httpOnly: !browser ? false : undefined,
    });
  }

  async saveSession(state: Session): Promise<void> {
    const browser = isBrowser();

    const { access, accessExpiresAt, refresh, refreshExpiresAt, csrf, user } =
      state;

    if (access) {
      const expires: Date =
        accessExpiresAt ?? new Date((jwtDecode(access) as any).exp * 1000);

      this.scuteStorage.setItem(SCUTE_ACCESS_STORAGE_KEY, access, {
        expires,
        httpOnly: !browser ? false : undefined,
      });
    }

    if (refresh) {
      const expires: Date =
        refreshExpiresAt ?? new Date((jwtDecode(refresh) as any).exp * 1000);

      this.scuteStorage.setItem(SCUTE_REFRESH_STORAGE_KEY, refresh, {
        expires,
        httpOnly: !browser ? true : undefined,
      });

      if (user) {
        this.scuteStorage.setItem(
          SCUTE_USER_STORAGE_KEY,
          JSON.stringify(user),
          {
            expires,
            // TODO: httpOnly: !browser ? false : undefined,
          }
        );
      }

      if (csrf) {
        this.scuteStorage.setItem(SCUTE_CSRF_STORAGE_KEY, csrf, {
          expires,
          httpOnly: !browser ? false : undefined,
        });
      }
    }
  }

  async getRememberedUser(): Promise<ScuteTokenPayloadUser> {
    const cookieVal = await this.scuteStorage.getItem(SCUTE_USER_STORAGE_KEY);
    const user = cookieVal ? JSON.parse(cookieVal) : null;
    return user;
  }

  static unAuthenticatedState(): Session {
    return {
      access: null,
      accessExpiresAt: null,
      refresh: null,
      refreshExpiresAt: null,
      csrf: null,
      user: null,
      status: "unauthenticated",
    };
  }
}
