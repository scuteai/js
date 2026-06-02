import type ScuteClient from "../ScuteClient";
import { AUTH_CHANGE_EVENTS } from "./constants";
import {
  scopedKey,
  legacyKey,
  type StorageKeyKind,
} from "./storage-keys";
import type { CookieAttributes } from "./types/general";
import { InvalidAuthTokenError, ScuteError } from "./errors";
import {
  decodeAccessToken,
  decodeRefreshToken,
  Deferred,
  isBrowser,
} from "./helpers";
import { UniqueIdentifier } from "./types/general";
import { ScuteIdentifier, ScuteTokenPayload } from "./types/scute";
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
  /** @internal — needed for per-app storage key namespacing. */
  protected abstract appId: ScuteClient["appId"];

  // ───────────────────────────────────────────────────────────
  // Per-app storage helpers
  //
  // Every session-relevant key is suffixed with `:<appId>` so two Scute apps
  // on the same browser origin don't overwrite each other's session. v0.7
  // still falls back to the legacy unsuffixed key on read and forward-
  // migrates the value into the namespaced slot, so live users don't get
  // signed out across the upgrade. v0.8 will drop the fallback.
  //
  // See tickets/25-sdk-change-multi-app-session-isolation.md.
  // ───────────────────────────────────────────────────────────

  /** @internal */
  protected _scopedKey(kind: StorageKeyKind): string {
    return scopedKey(kind, this.appId);
  }

  /**
   * Read a session-relevant key with legacy-fallback semantics.
   * Returns the namespaced value if present; otherwise reads the legacy
   * unsuffixed key and forward-migrates into the namespaced slot (best
   * effort — failures are swallowed so a read can never block sign-in).
   * @internal
   */
  protected async _readNamespaced(
    kind: StorageKeyKind,
    cookieOptions?: CookieAttributes,
  ): Promise<string | null> {
    const namespaced = await this.scuteStorage.getItem(this._scopedKey(kind));
    if (namespaced) return namespaced;

    const legacy = await this.scuteStorage.getItem(legacyKey(kind));
    if (!legacy) return null;

    // Forward-migrate to the namespaced slot. Best-effort: any error here is
    // logged via the storage adapter but does not break the read.
    try {
      await this.scuteStorage.setItem(
        this._scopedKey(kind),
        legacy,
        cookieOptions as any,
      );
    } catch {
      /* swallow — migration is opportunistic */
    }
    return legacy;
  }

  /** @internal */
  protected async _writeNamespaced(
    kind: StorageKeyKind,
    value: string,
    cookieOptions?: CookieAttributes,
  ): Promise<void> {
    await this.scuteStorage.setItem(
      this._scopedKey(kind),
      value,
      cookieOptions as any,
    );
  }

  /**
   * Remove both the namespaced key and the legacy unsuffixed key for the
   * given kind. Removes the legacy entry so a sign-out actually signs the
   * user out — otherwise a stale legacy value could resurrect a session on
   * the next legacy-fallback read.
   * @internal
   */
  protected async _removeNamespaced(
    kind: StorageKeyKind,
    cookieOptions?: CookieAttributes,
  ): Promise<void> {
    await this.scuteStorage.removeItem(
      this._scopedKey(kind),
      cookieOptions as any,
    );
    try {
      await this.scuteStorage.removeItem(
        legacyKey(kind),
        cookieOptions as any,
      );
    } catch {
      /* legacy key may not exist; harmless */
    }
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.removeItem(this._scopedKey(kind));
        window.localStorage.removeItem(legacyKey(kind));
      } catch {
        /* private-mode quirks */
      }
    }
  }

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

  /** @internal */
  protected abstract _initialize(
    ...params: Parameters<ScuteClient["_initialize"]>
  ): ReturnType<ScuteClient["_initialize"]>;

  /** @internal */
  protected abstract debug(
    ...params: Parameters<ScuteClient["debug"]>
  ): ReturnType<ScuteClient["debug"]>;

  protected refreshProxyCallback:
    | (() => Promise<Partial<ScuteTokenPayload> | void>)
    | null = null;

  /** @internal */
  protected _refreshDeferred: Deferred<
    Awaited<ReturnType<ScuteSession["__refresh"]>>
  > | null = null;

  /** @internal */
  protected _getSessionDeferred: Deferred<
    Awaited<ReturnType<ScuteSession["__getSession"]>>
  > | null = null;

  /** @internal */
  protected _expireSessionDeferred: Deferred<
    Awaited<ReturnType<ScuteSession["_expireSession"]>>
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
   * @internal
   * @see {@link __getSession}
   */
  protected async _getSession(...params: Parameters<typeof this.__getSession>) {
    // getSession is already in progress
    if (this._getSessionDeferred) {
      return this._getSessionDeferred.promise;
    }

    this._getSessionDeferred = new Deferred();
    const result = await this.__getSession(...params);
    this._getSessionDeferred.resolve(result);
    this._getSessionDeferred = null;

    return result;
  }

  /**
   * * `fresh` needs to be set to `true` to get the latest data from the server.
   * @param fresh - Fetch new data from the server
   * @param emitRefetchEvent - Emit refetch event when getting fresh data
   * @internal
   * @see {@link getSession}
   */
  private async __getSession(fresh?: boolean, emitRefetchEvent = true) {
    const { error: initializeError } = await this._initialize();
    if (initializeError) {
      return { data: { session: null, user: null }, error: initializeError };
    }

    const now = new Date();
    let session = await this.initialSessionState();

    if (session.access || session.refresh || this.refreshProxyCallback) {
      const expiresWithMargin = session.access
        ? session.accessExpiresAt.getTime() <
          now.getTime() + EXPIRY_MARGIN * 1000
        : true;

      if (expiresWithMargin) {
        if (this.config.autoRefreshToken) {
          this.debug(
            "#_getSession",
            "session expires with margin",
            "trying refresh"
          );
          const { data: refreshedSession, error: refreshError } =
            await this._refresh(session);

          if (refreshError) {
            this.debug("#_getSession", "refreshError");
            await this._handleRefreshError(refreshError);
            session = unAuthenticatedState();
          } else {
            if (refreshedSession.access) {
              this.debug("#_getSession", "refreshed");
              session = {
                access: refreshedSession.access,
                accessExpiresAt: refreshedSession.accessExpiresAt,
                refresh: refreshedSession.refresh ?? session.refresh,
                refreshExpiresAt:
                  refreshedSession.refreshExpiresAt ?? session.refreshExpiresAt,
                status: "authenticated",
              } as AuthenticatedSession;
            }
          }
        } else {
          this.debug(
            "#_getSession",
            "autoRefresh disabled",
            "expiring session"
          );

          await this._expireSession();
        }
      }
    }

    if (fresh) {
      return this._refetchSession(session, emitRefetchEvent);
    }

    return {
      data: { session, user: null },
      error: null,
    };
  }

  /**
   * Get session state from the storage.
   * @internal
   */
  protected async initialSessionState(): Promise<Session> {
    const access = await this._readNamespaced("access", {
      sameSite: "lax",
      httpOnly: false,
      path: "/",
    });
    const refresh =
      (await this._readNamespaced("refresh", {
        sameSite: "lax",
        httpOnly: !isBrowser() ? true : false,
        path: "/",
      })) ?? undefined;

    const decodedAccess = access ? decodeAccessToken(access) : undefined;
    const decodedRefresh = refresh ? decodeRefreshToken(refresh) : undefined;

    const isAuthenticated = !!access && !!decodedAccess;

    if (!isAuthenticated) {
      return {
        access: null,
        accessExpiresAt: null,
        refresh,
        refreshExpiresAt: decodedRefresh?.expiresAt,
        status: "unauthenticated",
      };
    }

    return {
      access,
      accessExpiresAt: decodedAccess.expiresAt,
      refresh,
      refreshExpiresAt: decodedRefresh?.expiresAt,
      status: "authenticated",
    };
  }

  /**
   * Refetch session.
   */
  async refetchSession() {
    let session: Session | null = null;

    if (this._refreshDeferred?.promise) {
      session = (await this._refreshDeferred.promise).data;
    }

    if (!session) {
      session = await this.initialSessionState();
    }

    return this._refetchSession(session);
  }

  /**
   * @param session {Session}
   * @internal
   * @see {@link refetchSession}
   */
  private async _refetchSession(session: Session, emitEvent = true) {
    const { data: authData, error: getAuthTokenError } =
      await this._getAuthToken(session);

    if (getAuthTokenError) {
      return { data: { session, user: null }, error: getAuthTokenError };
    }

    const { data, error: getUserError } = await this.getCurrentUser(
      authData.access
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

    return {
      data: { session, user: data.user },
      error: null,
    };
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

    return { data: refreshedSession, error: null };
  }

  /**
   * Set session to the storage. If persistence is not disabled
   * session will remain between hard refreshes.
   * @param payload - {ScuteTokenPayload}
   */
  protected async setSession(payload: Partial<ScuteTokenPayload>) {
    const decodedAccess = payload.access
      ? decodeAccessToken(payload.access)
      : null;

    if (!payload || !payload.access || !decodedAccess) {
      await this.removeSession();

      return unAuthenticatedState();
    }

    if (this.refreshProxyCallback) {
      // server must not send this in proxy mode
      // for maximum security
      payload.refresh = undefined;
    }

    const decodedRefresh = payload.refresh
      ? decodeRefreshToken(payload.refresh)
      : undefined;

    const session: Session = {
      access: payload.access,
      accessExpiresAt: decodedAccess.expiresAt,
      refresh: payload.refresh ?? undefined,
      refreshExpiresAt: decodedRefresh?.expiresAt,
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

    const { access, accessExpiresAt, refresh, refreshExpiresAt } = state;

    if (access) {
      await this._writeNamespaced("access", access, {
        expires: accessExpiresAt,
        sameSite: "lax",
        httpOnly: false,
        path: "/",
      });
    }

    if (refresh) {
      await this._writeNamespaced("refresh", refresh, {
        expires: refreshExpiresAt,
        sameSite: "lax",
        httpOnly: !browser ? true : false,
        path: "/",
      });
    }
  }

  /**
   * Remove session from the storage.
   */
  protected async removeSession(): Promise<void> {
    const browser = isBrowser();

    await this._removeNamespaced("access", {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
    });

    await this._removeNamespaced("refresh", {
      httpOnly: !browser ? true : false,
      sameSite: "lax",
      path: "/",
    });
  }

  /**
   * Expire the current sesion.
   * @internal
   */
  private async _expireSession(): Promise<Session> {
    if (this._expireSessionDeferred) {
      return this._expireSessionDeferred.promise;
    }

    this._expireSessionDeferred = new Deferred();

    const unauthenticatedSession = unAuthenticatedState();
    this.emitAuthChangeEvent(
      AUTH_CHANGE_EVENTS.SESSION_EXPIRED,
      unauthenticatedSession
    );

    await this.removeSession();

    this._expireSessionDeferred.resolve(unauthenticatedSession);
    this._expireSessionDeferred = null;

    return unauthenticatedSession;
  }

  /**
   * Sign out.
   * @internal
   * @see {@link ScuteClient.signOut}
   */
  protected async _signOut(accessToken?: string | null): Promise<boolean> {
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
    callback: NonNullable<ScuteSession["refreshProxyCallback"]>
  ): Promise<void> {
    this.refreshProxyCallback = async () => {
      try {
        return await callback();
      } catch {
        return;
      }
    };
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
      return { data: null, error: new InvalidAuthTokenError() };
    }

    return { data: { access: session.access }, error: null };
  }

  /**
   * Start auto refresh interval in the background. The session is checked
   * every few seconds.
   */
  async startAutoRefresh(): Promise<void> {
    this._removeVisibilityChangedCallback();
    await this._startAutoRefresh();
  }

  /**
   * Stop auto refresh interval in the background (if any).
   */
  async stopAutoRefresh(): Promise<void> {
    this._removeVisibilityChangedCallback();
    await this._stopAutoRefresh();
  }

  /**
   * @internal
   * @see {@link startAutoRefresh}
   */
  private async _startAutoRefresh(): Promise<void> {
    if (this.autoRefreshTicker) {
      await this._stopAutoRefresh();
    }

    this.autoRefreshTicker = setInterval(
      () => this._autoRefreshTokenTick(),
      AUTO_REFRESH_TICK_DURATION
    );

    // running next tick to prevent recursive
    setTimeout(async () => {
      await this._initialize();
      await this._autoRefreshTokenTick();
    }, 0);

    this.debug("#_startAutoRefresh", "start", "auto refresh");
  }

  /**
   * @internal
   * @see {@link stopAutoRefresh}
   */
  private async _stopAutoRefresh(): Promise<void> {
    const ticker = this.autoRefreshTicker;
    this.autoRefreshTicker = null;

    if (ticker) {
      clearInterval(ticker);
    }

    this.debug("#_stopAutoRefresh", "stop", "auto refresh");
  }

  /**
   * Runs the auto refresh token tick.
   */
  private async _autoRefreshTokenTick(): Promise<void> {
    this.debug("#_autoRefreshTokenTick", "start");

    const now = new Date();
    const session = await this.initialSessionState();

    if (session.access || session.refresh || this.refreshProxyCallback) {
      // session will expire in this many ticks (or has already expired if <= 0)
      const expiresInTicks = session.access
        ? Math.floor(
            (session.accessExpiresAt.getTime() - now.getTime()) /
              AUTO_REFRESH_TICK_DURATION
          )
        : 0;

      if (expiresInTicks <= AUTO_REFRESH_TICK_THRESHOLD) {
        const { error: refreshError } = await this._refresh(session);

        this.debug(
          "#_autoRefreshTokenTick",
          "end with",
          !refreshError ? "success" : "refresh error"
        );

        if (refreshError) {
          await this._handleRefreshError(refreshError);
        }
      } else {
        this.debug("#_autoRefreshTokenTick", "end with", "noop");
      }
    } else {
      this.debug("#_autoRefreshTokenTick", "end with", "noop");
    }
  }

  /**
   * @internal
   * @see {@link __refresh}
   */
  private async _refresh(...params: Parameters<typeof this.__refresh>) {
    // refreshing is already in progress
    if (this._refreshDeferred) {
      return this._refreshDeferred.promise;
    }

    this._refreshDeferred = new Deferred();
    const response = await this.__refresh(...params);
    this._refreshDeferred.resolve(response);
    this._refreshDeferred = null;

    return response;
  }

  /**
   * @param session {Session}
   * @internal
   * @see {@link refreshSession}
   */
  private async __refresh(session: Session) {
    if (!isBrowser()) {
      if (session.access || session.refresh) {
        const { data: tokenPayload, error: refreshError } = session.refresh
          ? await this.admin.refresh(session.refresh)
          : await this.admin.refreshWithAccess(session.access!);

        if (refreshError) {
          return { data: null, error: refreshError };
        } else {
          this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.TOKEN_REFRESHED);
        }

        session = await this.setSession(tokenPayload);
      }
    } else {
      if (!session.refresh && this.refreshProxyCallback) {
        this.debug(
          "#__refresh",
          "refreshProxyCallback detected",
          "trying to get data"
        );

        /** @see {@link setRefreshProxyCallback} */
        const payload = await this.refreshProxyCallback();

        if (payload && "access" in payload && payload.access) {
          session = await this.setSession(payload);
          this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.TOKEN_REFRESHED, session);
        }
      } else if (session.refresh) {
        const { data: tokenPayload, error: refreshError } =
          await this._refreshRequest(session.refresh);

        if (refreshError) {
          return { data: null, error: refreshError };
        } else {
          this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.TOKEN_REFRESHED);
          session = await this.setSession(tokenPayload);
        }
      } else {
        await this._signOut(session.access);
        session = unAuthenticatedState();
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
   * Register callback for `visibilitychange` browser event.
   * * (browser-only)
   */
  protected async registerVisibilityChange(): Promise<void> {
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
   * Register refetch interval
   * * (browser-only)
   */
  protected async registerRefetchInterval(): Promise<void> {
    if (this.config.refetchInverval) {
      setInterval(async () => {
        const session = await this.initialSessionState();
        if (
          session.access &&
          document.visibilityState === "visible" &&
          window.navigator.onLine
        ) {
          await this.refetchSession();
        }
      }, this.config.refetchInverval * 1000);
    }
  }

  /**
   * Removes any registered visibilitychange callback.
   *
   * @see {@link startAutoRefresh}
   * @see {@link stopAutoRefresh}
   */
  private _removeVisibilityChangedCallback(): void {
    const callback = this.visibilityChangedCallback;
    this.visibilityChangedCallback = null;

    if (callback && isBrowser() && window?.removeEventListener) {
      window.removeEventListener("visibilitychange", callback);
    }
  }

  /**
   * Callback registered with `window.addEventListener('visibilitychange')`.
   */
  private async _onVisibilityChanged(isInitial: boolean): Promise<void> {
    if (!this.config.autoRefreshToken) {
      return;
    }

    if (document.visibilityState === "visible") {
      this.debug("visibility changed to", "visible");

      // in browser environments the refresh token ticker runs only on focused tabs
      // which prevents race conditions
      await this._startAutoRefresh();

      if (!isInitial && this.config.refetchOnWindowFocus) {
        // refetch session on `visibilitychange`
        setTimeout(async () => {
          await this.refetchSession();
        }, 0);
      }
    } else if (document.visibilityState === "hidden") {
      this.debug("visibility changed to", "hidden");
      await this._stopAutoRefresh();
    }
  }

  /**
   * Get remembered (last logged) identifier.
   */
  async getRememberedIdentifier(): Promise<ScuteIdentifier | null> {
    return this._readNamespaced("lastLogin", {
      sameSite: "strict",
      path: "/",
    });
  }

  /**
   * Clear remembered (last logged) identifier.
   */
  async clearRememberedIdentifier(): Promise<void> {
    await this._removeNamespaced("lastLogin", {
      expires: new Date(new Date().getTime() + 400 * 24 * 60 * 60 * 1000), // 400 days (max) from now
      sameSite: "strict",
      path: "/",
    });
  }

  /**
   * @param identifier {ScuteIdentifier}
   * @internal
   */
  protected async setRememberedIdentifier(
    identifier: ScuteIdentifier
  ): Promise<void> {
    await this._writeNamespaced("lastLogin", identifier, {
      expires: new Date(new Date().getTime() + 400 * 24 * 60 * 60 * 1000), // 400 days (max) from now
      sameSite: "strict",
      path: "/",
    });
  }

  /**
   * Get credential store for new device checks.
   * @internal
   */
  private async _getCredentialStore(): Promise<
    Record<UniqueIdentifier, string[]>
  > {
    // Namespaced read first (preferred); legacy read-through via the helper.
    let credData = await this._readNamespaced("cred", {
      sameSite: "strict",
      path: "/",
    });

    if (!credData && typeof window !== "undefined" && window.localStorage) {
      // localStorage direct read: try namespaced, then legacy (for cookieless
      // storage adapters that don't see localStorage at all).
      credData =
        window.localStorage.getItem(this._scopedKey("cred")) ??
        window.localStorage.getItem(legacyKey("cred"));
    }

    try {
      return credData ? JSON.parse(credData) : {};
    } catch {
      return {};
    }
  }

  /**
   * Save credential store value string
   * @param value Store value string
   * @internal
   */
  private async _saveCredentialStore(value: string): Promise<void> {
    if (typeof window !== "undefined" && window.localStorage) {
      // localStorage fallback path — always namespaced.
      window.localStorage.setItem(this._scopedKey("cred"), value);
    }

    await this._writeNamespaced("cred", value, {
      expires: new Date(new Date().getTime() + 400 * 24 * 60 * 60 * 1000), // 400 days (max) from now
      sameSite: "strict",
      path: "/",
    });
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

    return this._getCredentialIds(store, userId);
  }

  /**
   *
   * @internal
   * @see {@link getCredentialIds}
   */
  private _getCredentialIds(
    store: Awaited<ReturnType<ScuteClient["_getCredentialStore"]>>,
    userId: UniqueIdentifier
  ) {
    const userIdStore = store[userId];

    if (!userIdStore) {
      return [];
    }

    return Array.isArray(userIdStore) ? userIdStore : [userIdStore];
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
  ): Promise<void> {
    const store = await this._getCredentialStore();

    const value = JSON.stringify({
      ...store,
      [userId]: Array.from(
        new Set(
          [...this._getCredentialIds(store, userId), credentialId].filter(
            Boolean
          )
        )
      ),
    });

    return this._saveCredentialStore(value);
  }

  /**
   * Delete credential id.
   * @param userId {UniqueIdentifier}
   * @param credentialId {UniqueIdentifier}
   * @internal
   */
  protected async deleteCredentialId(
    userId: UniqueIdentifier,
    credentialId: UniqueIdentifier
  ): Promise<void> {
    const store = await this._getCredentialStore();

    const value = JSON.stringify({
      ...store,
      [userId]: Array.from(
        new Set(
          [...this._getCredentialIds(store, userId), credentialId].filter(
            (item) => Boolean(item) && item !== credentialId
          )
        )
      ),
    });

    return this._saveCredentialStore(value);
  }
}

const unAuthenticatedState = (): Session => {
  return {
    access: null,
    accessExpiresAt: null,
    refresh: null,
    refreshExpiresAt: null,
    status: "unauthenticated",
  };
};

const loadingState = (): Session => {
  return {
    access: null,
    accessExpiresAt: null,
    refresh: null,
    refreshExpiresAt: null,
    status: "loading",
  };
};

export const sessionUnAuthenticatedState = unAuthenticatedState;
export const sessionLoadingState = loadingState;
