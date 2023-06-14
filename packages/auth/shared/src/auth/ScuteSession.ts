import Cookies from "js-cookie";
import { ScuteUser, ScuteAuthStateInterface } from "../types/auth";

interface ScuteSessionConfig {
  sessionStore: "cookie" | "localstorage";
  appId: string;
  appDomain: string;
}

export class ScuteSession {
  private sessionStore: "cookie" | "localstorage";
  private appId: string;
  private appDomain: string;

  private readonly _accessStorageName: string = "sc-access-token";
  private readonly _refreshStorageName: string = "sc-refresh-token";
  private readonly _csrfStorageName: string = "X-CSRF-Token";
  private readonly _accessExpiresStorageName: string = "sc-access_time";
  private readonly _refreshExpiresStorageName: string = "sc-refresh_time";
  private readonly _userStorageName: string = "scu_user";
  private readonly _userIdStorageName: string = "scu_uid";
  private readonly _stateToken: string = "scu_st";

  constructor(config: ScuteSessionConfig) {
    this.sessionStore = config.sessionStore;
    this.appId = config.appId;
    this.appDomain = config.appDomain;
  }

  initialState(): ScuteAuthStateInterface {
    return this.initialCookieToken();
  }

  initialCookieToken(): ScuteAuthStateInterface {
    const accessToken = Cookies.get(this._accessStorageName);
    const accessExpires = Cookies.get(this._accessExpiresStorageName);
    const refresh = Cookies.get(this._refreshStorageName);
    const refreshExpires = Cookies.get(this._refreshExpiresStorageName);
    const user = Cookies.get(this._userStorageName);
    const csrf = Cookies.get(this._csrfStorageName);
    return this.checkTokenExists(
      accessToken,
      accessExpires,
      refresh,
      refreshExpires,
      csrf,
      user
    );
  }

  public sync(authState: ScuteAuthStateInterface): void {
    if (authState.access && authState.refresh) {
      this.setCookies(authState);
    }
    if (authState.status === "unauthenticated") {
      this.removeCookies();
    }
  }

  setCookies(authState: ScuteAuthStateInterface) {
    const { access, refresh, csrf, accessExpiresAt, refreshExpiresAt, user } =
      authState;
    if (access && accessExpiresAt) {
      this.setCookie_(this._accessStorageName, access, accessExpiresAt, false);
      this.setCookie_(
        this._accessExpiresStorageName,
        accessExpiresAt,
        accessExpiresAt,
        false
      );
    }
    if (refresh && refreshExpiresAt) {
      this.setCookie_(this._refreshStorageName, refresh, refreshExpiresAt);
      this.setCookie_(
        this._refreshExpiresStorageName,
        refreshExpiresAt,
        refreshExpiresAt
      );
    }
    if (user && refreshExpiresAt) {
      this.setCookie_(
        this._userStorageName,
        JSON.stringify(user),
        refreshExpiresAt,
        false
      );
    }
    if (csrf) {
      this.setCookie_(this._csrfStorageName, csrf, refreshExpiresAt, false);
    }
  }

  setCookie_(
    key: string,
    value: string,
    expiration: Date,
    secure: boolean = true
  ) {
    Cookies.set(key, value, {
      expires: expiration,
      domain: this.appDomain,
      secure: secure,
    });
  }

  removeCookies(): void {
    Cookies.remove(this._accessStorageName, {
      domain: this.appDomain,
      secure: false,
    });
    Cookies.remove(this._refreshStorageName, {
      domain: this.appDomain,
      secure: true,
    });
    Cookies.remove(this._accessExpiresStorageName, {
      domain: this.appDomain,
      secure: false,
    });
    Cookies.remove(this._refreshExpiresStorageName, {
      domain: this.appDomain,
      secure: true,
    });
  }

  removeUserCookie(): void {
    Cookies.remove(this._userStorageName, {
      domain: this.appDomain,
      secure: false,
    });
    Cookies.remove(this._userIdStorageName, {
      domain: this.appDomain,
      secure: false,
    });
  }

  unAuthorizedState(): ScuteAuthStateInterface {
    return {
      appId: this.appId,
      access: null,
      refresh: null,
      csrf: null,
      accessExpiresAt: null,
      refreshExpiresAt: null,
      user: null,
      status: "unauthenticated",
    };
  }

  checkTokenExists(
    accessToken: string | null | undefined,
    accessExpires: string | null | undefined,
    refreshToken: string | null | undefined,
    refreshExpires: string | null | undefined,
    csrf: string | null | undefined,
    user: string | null | undefined
  ): ScuteAuthStateInterface {
    if (
      !!accessToken &&
      !!accessExpires &&
      !!refreshToken &&
      !!refreshExpires &&
      !!user &&
      !!csrf
    ) {
      const accessExpiresAt = new Date(accessExpires);
      const refreshExpiresAt = new Date(refreshExpires);

      try {
        const userState: ScuteUser = JSON.parse(user);
        console.log("user state is here:", userState);
        return {
          appId: this.appId,
          access: accessToken,
          refresh: refreshToken,
          csrf: csrf,
          accessExpiresAt: accessExpiresAt,
          refreshExpiresAt: refreshExpiresAt,
          user: userState,
          status: "authenticated",
        };
      } catch (e) {
        return this.unAuthorizedState();
      }
    } else {
      return this.unAuthorizedState();
    }
  }
}
