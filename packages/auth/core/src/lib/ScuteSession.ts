import type ScuteClient from "../ScuteClient";
import {
  AUTH_CHANGE_EVENTS,
  SCUTE_ACCESS_STORAGE_KEY,
  SCUTE_CRED_STORAGE_KEY,
  SCUTE_CSRF_STORAGE_KEY,
  SCUTE_LAST_LOGIN_STORAGE_KEY,
  SCUTE_REFRESH_STORAGE_KEY,
} from "./constants";
import { LoginRequiredError, ScuteError } from "./errors";
import {
  decodeAccessToken,
  decodeRefreshToken,
  Deferred,
  isBrowser,
} from "./helpers";
import { UniqueIdentifier } from "./types/general";
import { ScuteIdentifier, ScuteTokenPayload, ScuteUser } from "./types/scute";
import { AuthenticatedSession, Session } from "./types/session";

/** session will be checked for refresh at this interval */
const AUTO_REFRESH_TICK_DURATION = 30 * 1000;

// in seconds
const EXPIRY_MARGIN = 10;

/** ticks before the current session expires */
const AUTO_REFRESH_TICK_THRESHOLD = 3;

export abstract class ScuteSession {
  /** @internal */
  protected abstract config: ScuteClient["config"];
  /** @internal */
  protected abstract scuteStorage: ScuteClient["scuteStorage"];
  /** @internal */
  protected abstract admin: ScuteClient["admin"];

  /** @internal */
  protected abstract getCurrentUser(
    ...params: Parameters<ScuteClient["getCurrentUser"]>
  ): ReturnType<ScuteClient["getCurrentUser"]>;

  /** @internal */
  protected abstract _refreshRequest(
    ...params: Parameters<ScuteClient["_refreshRequest"]>
  ): ReturnType<ScuteClient["_refreshRequest"]>;

  /** @internal */
  protected abstract emitAuthChangeEvent(
    ...params: Parameters<ScuteClient["emitAuthChangeEvent"]>
  ): ReturnType<ScuteClient["emitAuthChangeEvent"]>;

  protected refreshProxyCallback = async () =>
    ({} as Partial<ScuteTokenPayload>);

  protected refreshDeferred: Deferred<
    Awaited<ReturnType<ScuteSession["__refresh"]>>
  > | null = null;

  protected autoRefreshTicker: ReturnType<typeof setInterval> | null = null;
  protected visibilityChangedCallback: (() => Promise<any>) | null = null;

  /**
   * Get current session.
   */
  async getSession() {
    return this._getSession(true);
  }

  /**
   * * `fresh` needs to be set to `true` to get the latest data from the server.
   * @param fresh - Fetch new data from the server
   * @param emitRefetchEvent - Emit refetch event when getting fresh data
   * @internal
   * @see {@link getSession}
   */
  protected async _getSession(fresh?: boolean, emitRefetchEvent = true) {
    let session = await this.initialSessionState();
    let user: ScuteUser | null = null;

    if (session.access) {
      const expiresWithMargin =
        session.accessExpiresAt.getTime() <
        new Date().getTime() + EXPIRY_MARGIN * 1000;

      if (expiresWithMargin) {
        if (this.config.autoRefreshToken) {
          const { data: refreshedSession, error: refreshError } =
            await this._refresh(session);

          if (refreshError) {
            await this._handleRefreshError(refreshError);
            session = unAuthenticatedState();
          } else {
            session = refreshedSession;
          }
        } else {
          await this._expireSession();
        }
      }

      if (fresh) {
        return this._refetchSession(session, emitRefetchEvent);
      }
    }

    return { data: { session, user }, error: null };
  }

  /**
   * Get session state from the storage.
   * @internal
   */
  protected async initialSessionState(): Promise<Session> {
    const access = await this.scuteStorage.getItem(SCUTE_ACCESS_STORAGE_KEY);
    const refresh =
      (await this.scuteStorage.getItem(SCUTE_REFRESH_STORAGE_KEY)) ?? undefined;
    const csrf =
      (await this.scuteStorage.getItem(SCUTE_CSRF_STORAGE_KEY)) ?? undefined;

    const session = {
      access,
      refresh,
      csrf,
    } as Session;

    const decodedAccess = session.access
      ? decodeAccessToken(session.access)
      : undefined;

    if (!session.access || !decodedAccess) {
      return unAuthenticatedState();
    }

    const decodedRefresh = session.refresh
      ? decodeRefreshToken(session.refresh)
      : undefined;

    return {
      access: session.access,
      accessExpiresAt: decodedAccess.expiresAt,
      refresh: session.refresh,
      refreshExpiresAt: decodedRefresh?.expiresAt,
      csrf: session.csrf,
      status: "authenticated",
    };
  }

  /**
   * Refetch session.
   */
  async refetchSession() {
    const session = await this.initialSessionState();
    return this._refetchSession(session);
  }

  /**
   * @param session {Session}
   * @internal
   * @see {@link refetchSession}
   */
  private async _refetchSession(session: Session, emitEvent = true) {
    const { data: accessToken, error: getAuthTokenError } =
      await this._getAuthToken(session);

    if (getAuthTokenError) {
      return { data: { session, user: null }, error: getAuthTokenError };
    }

    const { data, error: getUserError } = await this.getCurrentUser(
      accessToken
    );

    if (getUserError) {
      return this._handleGetCurrentUserError(getUserError);
    }

    if (emitEvent) {
      this.emitAuthChangeEvent(
        AUTH_CHANGE_EVENTS.SESSION_REFETCH,
        session,
        data.user
      );
    }

    return { data: { session, user: data.user }, error: null };
  }

  /**
   * Refresh and save new auth token with current session.
   */
  async refreshSession() {
    const session = await this.initialSessionState();
    const { data: refreshedSession, error: refreshError } = await this._refresh(
      session
    );

    if (refreshError) {
      return this._handleRefreshError(refreshError);
    }

    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.TOKEN_REFRESHED);

    return { data: refreshedSession, error: null };
  }

  /**
   * Set session to the storage. If persistence is not disabled
   * session will remain between hard refreshes.
   * @param payload - {ScuteTokenPayload}
   */
  protected async setSession(payload: Partial<ScuteTokenPayload>) {
    if (!payload || !payload.access) {
      this.removeSession();

      return unAuthenticatedState();
    }

    const decodedAccess = decodeAccessToken(payload.access);
    if (!decodedAccess) {
      return unAuthenticatedState();
    }

    const decodedRefresh = payload.refresh
      ? decodeRefreshToken(payload.refresh)
      : undefined;

    const session: Session = {
      access: payload.access,
      accessExpiresAt: decodedAccess.expiresAt,
      refresh: payload.refresh ?? undefined,
      refreshExpiresAt: decodedRefresh?.expiresAt,
      csrf: payload.csrf ?? undefined,
      status: "authenticated",
    };

    await this._saveSession(session);

    return session;
  }

  /**
   * Save session to the storage.
   * @param state {AuthenticatedSession}
   * @internal
   * @see {@link setSession}
   */
  private async _saveSession(state: AuthenticatedSession): Promise<void> {
    const browser = isBrowser();

    const { access, accessExpiresAt, refresh, refreshExpiresAt, csrf } = state;

    if (access) {
      this.scuteStorage.setItem(SCUTE_ACCESS_STORAGE_KEY, access, {
        expires: accessExpiresAt,
        httpOnly: false,
      });
    }

    if (refresh) {
      this.scuteStorage.setItem(SCUTE_REFRESH_STORAGE_KEY, refresh, {
        expires: refreshExpiresAt,
        httpOnly: !browser ? true : false,
      });

      if (csrf) {
        this.scuteStorage.setItem(SCUTE_CSRF_STORAGE_KEY, csrf, {
          expires: refreshExpiresAt,
          httpOnly: false,
        });
      }
    }
  }

  /**
   * Remove session from the storage.
   */
  protected async removeSession(): Promise<void> {
    const browser = isBrowser();

    await this.scuteStorage.removeItem(SCUTE_ACCESS_STORAGE_KEY, {
      httpOnly: false,
    });

    await this.scuteStorage.removeItem(SCUTE_REFRESH_STORAGE_KEY, {
      httpOnly: !browser ? true : false,
    });

    await this.scuteStorage.removeItem(SCUTE_CSRF_STORAGE_KEY, {
      httpOnly: false,
    });
  }

  /**
   * Expire the current sesion.
   */
  private async _expireSession() {
    const unauthenticatedSession = unAuthenticatedState();
    this.emitAuthChangeEvent(
      AUTH_CHANGE_EVENTS.SESSION_EXPIRED,
      unauthenticatedSession
    );

    await this.removeSession();

    return unauthenticatedSession;
  }

  /**
   * Sign out.
   * @internal
   * @see {@link ScuteClient.signOut}
   */
  protected async _signOut(accessToken?: string | null) {
    await this.removeSession();

    if (accessToken) {
      const { error: signOutError } = await this.admin.signOut(accessToken);

      if (signOutError) {
        return false;
      }
    }

    return true;
  }

  /**
   * Set refresh proxy callback. This is useful when you do not want
   * to pass the refresh token to the client.
   *
   * Send request to your backend server to refresh session with secret key
   * in callback function.
   *
   * * Needs backend server
   * @param callback - Callback function to
   */
  async setRefreshProxyCallback(
    callback: () => Promise<Partial<ScuteTokenPayload>>
  ) {
    this.refreshProxyCallback = () => callback();
  }

  /**
   * Get access token from the current session.
   *
   * @param session {Session}
   * @internal
   *
   * @see {@link ScuteClient.getAuthToken}
   */
  protected async _getAuthToken(session: Session) {
    if (!session.access) {
      return { data: null, error: new LoginRequiredError() };
    }

    return { data: session.access, error: null };
  }

  /**
   * Start auto refresh interval in the background. The session is checked
   * every few seconds.
   */
  async startAutoRefresh() {
    this._removeVisibilityChangedCallback();
    await this._startAutoRefresh();
  }

  /**
   * Stop auto refresh interval in the background (if any).
   */
  async stopAutoRefresh() {
    this._removeVisibilityChangedCallback();
    await this._stopAutoRefresh();
  }

  /**
   * @internal
   * @see {@link startAutoRefresh}
   */
  private async _startAutoRefresh() {
    await this._stopAutoRefresh();

    this.autoRefreshTicker = setInterval(
      () => this._autoRefreshTokenTick(),
      AUTO_REFRESH_TICK_DURATION
    );

    setTimeout(async () => {
      await this._autoRefreshTokenTick();
    }, 0);
  }

  /**
   * @internal
   * @see {@link stopAutoRefresh}
   */
  private async _stopAutoRefresh() {
    const ticker = this.autoRefreshTicker;
    this.autoRefreshTicker = null;

    if (ticker) {
      clearInterval(ticker);
    }
  }

  /**
   * @internal
   * @see {@link __refresh}
   */
  private async _refresh(...params: Parameters<typeof this.__refresh>) {
    // refreshing is already in progress
    if (this.refreshDeferred) {
      return this.refreshDeferred.promise;
    }

    this.refreshDeferred = new Deferred();
    const response = await this.__refresh(...params);
    this.refreshDeferred.resolve(response);

    return response;
  }

  /**
   * @param session {Session}
   * @internal
   * @see {@link refreshSession}
   */
  private async __refresh(session: Session) {
    if (!isBrowser()) {
      const { data: tokenPayload, error: refreshError } =
        await this.admin.refresh(session.refresh!);

      if (refreshError) {
        return { data: null, error: refreshError };
      }

      session = await this.setSession(tokenPayload);
    } else {
      if (!session.refresh || !session.csrf) {
        /** @see {@link setRefreshProxyCallback} */
        const payload = await this.refreshProxyCallback();
        if (payload.access) {
          session = await this.setSession(payload);
        }
      } else {
        const { data: tokenPayload, error: refreshError } =
          await this._refreshRequest(session.refresh, session.csrf);

        if (refreshError) {
          return { data: null, error: refreshError };
        } else {
          session = await this.setSession(tokenPayload);
        }
      }
    }

    return { data: session, error: null };
  }

  /**
   * Handle refetch session (getCurrentUser) error
   * @internal
   */
  private async _handleGetCurrentUserError(error: ScuteError) {
    const session = await this._expireSession();

    return {
      data: { session, user: null },
      error,
    };
  }

  /**
   * Handle refresh session error
   * @internal
   */
  private async _handleRefreshError(error: ScuteError) {
    await this._expireSession();

    return {
      data: null,
      error,
    };
  }

  /**
   * Runs the auto refresh token tick.
   */
  private async _autoRefreshTokenTick() {
    const now = new Date();
    const session = await this.initialSessionState();

    if (!session.access) {
      return;
    }

    // session will expire in this many ticks (or has already expired if <= 0)
    const expiresInTicks = Math.floor(
      (session.accessExpiresAt.getTime() - now.getTime()) /
        AUTO_REFRESH_TICK_DURATION
    );

    if (expiresInTicks <= AUTO_REFRESH_TICK_THRESHOLD) {
      const { error: refreshError } = await this._refresh(session);

      if (refreshError) {
        await this._handleRefreshError(refreshError);
      }
    }
  }

  /**
   * Register callback for `visibilitychange` browser event.
   */
  protected async registerVisibilityChange() {
    if (!isBrowser()) {
      return;
    }

    this.visibilityChangedCallback = () => this._onVisibilityChanged(false);

    window?.addEventListener(
      "visibilitychange",
      this.visibilityChangedCallback
    );

    await this._onVisibilityChanged(true); // initial call
  }

  /**
   * Removes any registered visibilitychange callback.
   *
   * @see {@link startAutoRefresh}
   * @see {@link stopAutoRefresh}
   */
  private _removeVisibilityChangedCallback() {
    const callback = this.visibilityChangedCallback;
    this.visibilityChangedCallback = null;

    if (callback && isBrowser() && window?.removeEventListener) {
      window.removeEventListener("visibilitychange", callback);
    }
  }

  /**
   * Callback registered with `window.addEventListener('visibilitychange')`.
   */
  private async _onVisibilityChanged(isInitial: boolean) {
    if (!this.config.autoRefreshToken) {
      return;
    }

    if (document.visibilityState === "visible") {
      // in browser environments the refresh token ticker runs only on focused tabs
      // which prevents race conditions
      await this._startAutoRefresh();

      if (!isInitial) {
        // refetch session on `visibilitychange`
        await this.refetchSession();
      }
    } else if (document.visibilityState === "hidden") {
      await this._stopAutoRefresh();
    }
  }

  /**
   * Get remembered (last logged) identifier.
   */
  async getRememberedIdentifier(): Promise<ScuteIdentifier | null> {
    return this.scuteStorage.getItem(SCUTE_LAST_LOGIN_STORAGE_KEY);
  }

  /**
   * Clear remembered (last logged) identifier.
   */
  async clearRememberedIdentifier() {
    return this.scuteStorage.removeItem(SCUTE_LAST_LOGIN_STORAGE_KEY);
  }

  /**
   * @param identifier {ScuteIdentifier}
   * @internal
   */
  protected async setRememberedIdentifier(
    identifier: ScuteIdentifier
  ): Promise<void> {
    return this.scuteStorage.setItem(SCUTE_LAST_LOGIN_STORAGE_KEY, identifier);
  }

  /**
   * Get credential store for new device checks.
   * @internal
   */
  private async _getCredentialStore() {
    const credData = await this.scuteStorage.getItem(SCUTE_CRED_STORAGE_KEY);
    const parsed = credData ? JSON.parse(credData) : {};

    return parsed;
  }

  /**
   * Get all stored credential ids as array.
   * @param userId {UniqueIdentifier}
   * @internal
   */
  protected async getCredentialIds(
    userId: UniqueIdentifier
  ): Promise<string[]> {
    const store = await this._getCredentialStore();
    return Array.isArray(store[userId]) ? store[userId] : [store[userId]];
  }

  /**
   * Store credential id.
   * @param userId {UniqueIdentifier}
   * @param credentialId {UniqueIdentifier}
   * @internal
   */
  protected async storeCredentialId(
    userId: UniqueIdentifier,
    credentialId: UniqueIdentifier
  ) {
    return this.scuteStorage.setItem(
      SCUTE_CRED_STORAGE_KEY,
      JSON.stringify({
        ...this._getCredentialStore(),
        [userId]: Array.from(
          new Set(
            [...(await this.getCredentialIds(userId)), credentialId].filter(
              Boolean
            )
          )
        ),
      })
    );
  }
}

const unAuthenticatedState = (): Session => {
  return {
    access: null,
    accessExpiresAt: null,
    refresh: null,
    refreshExpiresAt: null,
    csrf: null,
    status: "unauthenticated",
  };
};

const loadingState = (): Session => {
  return {
    access: null,
    accessExpiresAt: null,
    refresh: null,
    refreshExpiresAt: null,
    csrf: null,
    status: "loading",
  };
};

export const sessionUnAuthenticatedState = unAuthenticatedState;
export const sessionLoadingState = loadingState;
