import jwtDecode from "jwt-decode";
import { ScuteCookieStorage, ScuteStorage } from "./ScuteBaseStorage";
import {
  SCUTE_ACCESS_STORAGE_KEY,
  SCUTE_CSRF_STORAGE_KEY,
  SCUTE_LAST_LOGIN_STORAGE_KEY,
  SCUTE_REFRESH_STORAGE_KEY,
} from "./constants";
import type {
  UniqueIdentifier,
  Session,
  ScuteSessionConfig,
  ScuteIdentifier,
} from "./types";
import { isBrowser } from "./helpers";

export class ScuteSession {
  protected appId: UniqueIdentifier;
  protected scuteStorage: ScuteStorage | ScuteCookieStorage;

  constructor(config: ScuteSessionConfig) {
    this.appId = config.appId;
    this.scuteStorage = config.storage;
  }

  async initialState(): Promise<Session> {
    const browser = isBrowser();

    const access = await this.scuteStorage.getItem(SCUTE_ACCESS_STORAGE_KEY);
    const refresh = await this.scuteStorage.getItem(SCUTE_REFRESH_STORAGE_KEY);
    const csrf = await this.scuteStorage.getItem(SCUTE_CSRF_STORAGE_KEY);

    const accessPayload = access ? jwtDecode<any>(access) : null;

    if (
      !access ||
      (!refresh && !browser) ||
      !csrf ||
      !accessPayload ||
      !accessPayload.exp
    ) {
      await this.removeSession();
      return ScuteSession.unAuthenticatedState();
    }

    const { exp: accessExpiresAt } = accessPayload;
    const { exp: refreshExpiresAt } =
      !browser && refresh ? jwtDecode<any>(refresh) : ({} as any);

    return {
      access,
      accessExpiresAt: new Date(accessExpiresAt * 1000),
      refresh,
      refreshExpiresAt: refreshExpiresAt
        ? new Date(refreshExpiresAt * 1000)
        : null,
      csrf,
      status: "authenticated",
    };
  }

  async sync(session: Session | null) {
    if (
      !session ||
      !session.access ||
      (!session.refresh && !isBrowser()) ||
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
    this.scuteStorage.removeItem(SCUTE_CSRF_STORAGE_KEY, {
      httpOnly: !browser ? false : undefined,
    });
  }

  async saveSession(state: Session): Promise<void> {
    const browser = isBrowser();

    const { access, accessExpiresAt, refresh, refreshExpiresAt, csrf } = state;

    if (access) {
      const expires: Date =
        accessExpiresAt ?? new Date(jwtDecode<any>(access).exp * 1000);

      this.scuteStorage.setItem(SCUTE_ACCESS_STORAGE_KEY, access, {
        expires,
        httpOnly: !browser ? false : undefined,
      });
    }

    if (refresh) {
      const expires: Date =
        refreshExpiresAt ?? new Date(jwtDecode<any>(refresh).exp * 1000);

      this.scuteStorage.setItem(SCUTE_REFRESH_STORAGE_KEY, refresh, {
        expires,
        httpOnly: !browser ? true : undefined,
      });

      if (csrf) {
        this.scuteStorage.setItem(SCUTE_CSRF_STORAGE_KEY, csrf, {
          expires,
          httpOnly: !browser ? false : undefined,
        });
      }
    }
  }

  async setRememberedIdentifier(identifier: ScuteIdentifier): Promise<void> {
    console.log(SCUTE_LAST_LOGIN_STORAGE_KEY, identifier);
    return this.scuteStorage.setItem(SCUTE_LAST_LOGIN_STORAGE_KEY, identifier);
  }

  async getRememberedIdentifier(): Promise<ScuteIdentifier | null> {
    return this.scuteStorage.getItem(SCUTE_LAST_LOGIN_STORAGE_KEY);
  }

  static unAuthenticatedState(): Session {
    return {
      access: null,
      accessExpiresAt: null,
      refresh: null,
      refreshExpiresAt: null,
      csrf: null,
      status: "unauthenticated",
    };
  }
}
