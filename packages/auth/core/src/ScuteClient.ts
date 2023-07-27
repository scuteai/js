import { BroadcastChannel } from "broadcast-channel";
import mitt, { type Emitter, type Handler } from "mitt";

import {
  ScuteBaseHttp,
  ScuteSession,
  ScuteNoneStorage,
  type AuthChangeEvent,
  AUTH_CHANGE_EVENTS,
  type InternalEvent,
  INTERNAL_EVENTS,
  SCUTE_BROADCAST_CHANNEL,
  webauthn,
  isBrowser,
  identifyAuthenticationError,
  identifyRegistrationError,
  isWebauthnSupported,
  ScuteError,
  ScuteStorage,
  getUserIdFromAccessToken,
  SCUTE_LAST_LOGIN_STORAGE_KEY,
  loginRequiredError,
  identifierNotRecognizedError,
  identifierAlreadyExistError,
  SCUTE_CRED_STORAGE_KEY,
} from "./lib";

import type {
  ScuteClientConfig,
  ScuteDevice,
  ScuteIdentifier,
  ScuteMagicLinkIdResponse,
  ScuteSignInOptions,
  ScuteSignInOrUpOptions,
  ScuteSignUpOptions,
  ScuteTokenPayload,
  ScuteUser,
  Session,
  UniqueIdentifier,
} from "./lib/types";
import { ScuteAdminApi } from "./ScuteAdminApi";

export class ScuteClient extends ScuteBaseHttp {
  protected appId: ScuteClientConfig["appId"];
  protected readonly scuteSession: ScuteSession;
  protected persistSession: boolean;
  protected autoRefreshToken: boolean;
  admin: ScuteAdminApi;

  protected readonly storage: ScuteStorage;
  protected readonly emitter: Emitter<InternalEvent>;
  protected readonly channel: BroadcastChannel | null = null;
  protected initializePromise: ReturnType<typeof this.__initialize> | null =
    null;

  constructor(config: ScuteClientConfig) {
    const baseUrl = config.baseUrl || "https://api.scute.io";
    const appId = config.appId;

    if (!appId) {
      throw new ScuteError({
        message: "Scute appId is required!",
      });
    }

    const endpointPrefix = `/v1/auth/${appId}`;
    super(`${baseUrl}${endpointPrefix}`, {
      credentials: "include",
    });

    this.appId = appId;

    this.persistSession = config.preferences?.persistSession !== false;
    this.autoRefreshToken = config.preferences?.autoRefreshToken !== false;

    this.storage =
      config.preferences?.sessionStorageAdapter ??
      (typeof window === "undefined"
        ? ScuteNoneStorage
        : (window.localStorage as any));

    this.scuteSession = new ScuteSession({
      appId: this.appId,
      storage: this.persistSession ? this.storage : ScuteNoneStorage,
    });

    this.admin = new ScuteAdminApi({
      appId,
      baseUrl,
      secretKey: config.secretKey,
    });

    this.emitter = mitt<InternalEvent>();

    if (isBrowser()) {
      this.channel = new BroadcastChannel(SCUTE_BROADCAST_CHANNEL, {
        type: "native",
      });
    }
  }

  /**
   * Initializes the client SDK (cached, making sure it is initialized only once).
   * @internal
   */
  private _initialize() {
    if (!this.initializePromise) {
      // cache
      this.initializePromise = this.__initialize();
    }

    return this.initializePromise;
  }

  /**
   * Initializes the client SDK.
   * @internal
   */
  private async __initialize() {
    if (isBrowser()) {
      if (this.persistSession) {
        // only when persisting the session and running in the browser
        this._setupSessionBroadcast();
      }
    }
  }

  /**
   * Initializes broadcast channel for other tabs listening.
   * @internal
   */
  private _setupSessionBroadcast() {
    if (!this.channel) return;

    this.emitter.on(
      INTERNAL_EVENTS.AUTH_STATE_CHANGED,
      (payload) =>
        // prevent infinite loop
        !payload._broadcasted &&
        this.channel!.postMessage({
          type: INTERNAL_EVENTS.AUTH_STATE_CHANGED,
          payload,
        })
    );

    this.channel.onmessage = (msg) => {
      if (msg.type === INTERNAL_EVENTS.AUTH_STATE_CHANGED) {
        this.emitter.emit(INTERNAL_EVENTS.AUTH_STATE_CHANGED, {
          ...msg.payload,
          // prevent infinite loop
          _broadcasted: true,
        });
      }
    };
  }

  /**
   * Receive a notification every time an auth event happens.
   * @param callback - A callback function to be invoked when an auth event happens.
   */
  onAuthStateChange(
    callback: (
      event: AuthChangeEvent,
      session: Session,
      user: ScuteUser | null
    ) => void
  ) {
    const handler: Handler<
      InternalEvent[typeof INTERNAL_EVENTS.AUTH_STATE_CHANGED]
    > = async ({ event, session, user }) => {
      if (!session || !user) {
        // if user is passed that means server check already happened
        // otherwise in specific events refetch user
        const { data } = await this._getSession(
          !user
            ? event === AUTH_CHANGE_EVENTS.INITIAL_SESSION ||
              event === AUTH_CHANGE_EVENTS.TOKEN_REFRESH
              ? true
              : false
            : false
        );

        session = data.session;
      }

      callback(event, session, user ?? null);
    };

    this.emitter.on(INTERNAL_EVENTS.AUTH_STATE_CHANGED, handler);
    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.INITIAL_SESSION);

    return () => this.emitter.off(INTERNAL_EVENTS.AUTH_STATE_CHANGED, handler);
  }

  /**
   * Log in an existing user with an email adress or phone number.
   * Scute will try to sign in with webauthn if not disabled and supported
   * by the browser, otherwise it will continue with fallback method.
   *
   * @param identifier {ScuteIdentifier}
   * @param options {ScuteSignInOptions}
   * @returns Polling data if webauthn is not available else null.
   */
  async signIn(identifier: ScuteIdentifier, options?: ScuteSignInOptions) {
    const user = await this.identifierExists(identifier);

    if (!user) {
      return {
        data: null,
        error: identifierNotRecognizedError(),
      };
    }

    return this._signIn(identifier, user, options);
  }

  /**
   * Log in or create a new user.
   *
   * @param identifier {ScuteIdentifier}
   * @param options {ScuteSignInOrUpOptions}
   * @returns Polling data if webauthn is not available else null.
   * @see {signIn}
   * @see {signUp}
   */
  async signInOrUp(
    identifier: ScuteIdentifier,
    options?: ScuteSignInOrUpOptions
  ) {
    const user = await this.identifierExists(identifier);

    return user
      ? this._signIn(identifier, user, options)
      : this._signUp(identifier);
  }

  /**
   * Log in.
   * @internal
   * @see {signIn}
   */
  private async _signIn(
    identifier: ScuteIdentifier,
    user: ScuteUser,
    options?: ScuteSignInOptions
  ) {
    if (
      options?.webauthn !== "disabled" &&
      isWebauthnSupported() &&
      user.webauthn_enabled
    ) {
      const { error: verifyError } = await this._signInWithVerifyDevice(
        identifier,
        user.id
      );

      if (verifyError) {
        if (
          verifyError instanceof ScuteError &&
          verifyError.code === "new-device"
        ) {
          this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.MAGIC_NEW_DEVICE_PENDING);
          return this.sendLoginMagicLink(identifier);
        }

        return { data: null, error: verifyError };
      }

      return { data: null, error: null };
    }

    return this.sendLoginMagicLink(identifier);
  }

  /**
   * Creates a new user.
   *
   * @param identifier {ScuteIdentifier}
   * @param options {ScuteSignInOptions}
   * @returns Polling data.
   */
  async signUp(identifier: ScuteIdentifier, options?: ScuteSignUpOptions) {
    if (await this._identifierExistsAndVerified(identifier)) {
      return {
        data: null,
        error: identifierAlreadyExistError(),
      };
    }

    return this._signUp(identifier, options);
  }

  /**
   * Creates a user.
   * @internal
   * @see {signUp}
   */
  private async _signUp(
    identifier: ScuteIdentifier,
    options?: ScuteSignUpOptions
  ) {
    return this.sendRegisterMagicLink(identifier);
  }

  /**
   * Log in with magic link token.
   * @param token - Magic link token (sct_magic)
   */
  async signInWithMagicLink(token: string) {
    const { data: payload, error } = await this.verifyMagicLink(token);
    if (error) return { error };

    return this.signInWithTokenPayload(payload);
  }

  /**
   * Log in with registering the current device.
   * @param payload - Scute auth payload
   */
  async signInWithRegisterDevice(payload: ScuteTokenPayload) {
    const { error: registerDeviceError } = await this._signInWithRegisterDevice(
      payload
    );

    if (registerDeviceError) {
      return { error: registerDeviceError };
    }

    return this.signInWithTokenPayload(payload);
  }

  /**
   * Verify Magic link token and log in with registering the current device.
   * @param token - Magic link token (sct_magic)
   */
  async verifyMagicLinkSignInWithNewDevice(token: string) {
    const { data: payload, error } = await this.verifyMagicLink(token);

    if (error) {
      return { error };
    }

    return this._signInWithRegisterDevice(payload);
  }

  /**
   * Register device for webauthn. This method will trigger the browser popup.
   */
  async addDevice() {
    const {
      data: { session },
      error: sessionError,
    } = await this.getSession();

    if (sessionError) {
      return { data: null, error: sessionError };
    }

    return this._addDevice(session.access!);
  }

  /**
   * @param accessToken - Auth token
   * @internal
   * @see {addDevice}
   */
  private async _addDevice(accessToken: string) {
    const { data, error: initializeError } =
      await this.webauthnInitializeRegister(accessToken);

    if (initializeError) return { data: null, error: initializeError };

    return this.webauthnFinalizeRegister(
      {
        publicKey: data.options,
      },
      accessToken
    );
  }

  /**
   * Register the device (create webauthn credentials) and login.
   * @internal
   * @see {signInWithRegisterDevice}
   */
  private async _signInWithRegisterDevice(payload: ScuteTokenPayload) {
    const { error: registerError } = await this._addDevice(payload.access);

    if (registerError) {
      return { error: registerError };
    }

    return this.signInWithTokenPayload(payload);
  }

  /**
   * Verify the device (assert webauthn credentials) and log in.
   * @param identifier {ScuteIdentifier}
   */
  async signInWithVerifyDevice(identifier: ScuteIdentifier) {
    const user = await this.identifierExists(identifier);

    if (!user) {
      return {
        data: null,
        error: identifierNotRecognizedError(),
      };
    }

    return this._signInWithVerifyDevice(identifier, user.id);
  }

  /**
   * @param identifier {ScuteIdentifier}
   * @param userId {UniqueIdentifier}
   * @internal
   * @see {signInWithVerifyDevice}
   */
  private async _signInWithVerifyDevice(
    identifier: ScuteIdentifier,
    userId: UniqueIdentifier
  ) {
    const { data, error: initializeError } = await this.webauthnInitializeLogin(
      identifier
    );

    if (initializeError) return { data: null, error: initializeError };

    if (await this._webauthnIsNewDevice(userId, data.options)) {
      return {
        data: null,
        error: new ScuteError({ code: "new-device", message: "New Device" }),
      };
    }

    const { data: payload, error: finalizeError } =
      await this.webauthnFinalizeLogin({
        publicKey: data.options,
      });

    if (finalizeError) return { error: finalizeError };

    return this.signInWithTokenPayload(payload);
  }

  /**
   * Log in with the magic link status id if it is consumed.
   * @param id Magic link status id
   */
  async signInWithMagicLinkId(id: UniqueIdentifier) {
    const { data: payload, error: magicStatusError } =
      await this.getMagicLinkStatus(id);

    if (magicStatusError) {
      return { error: magicStatusError };
    }

    return this.signInWithTokenPayload(payload);
  }

  /**
   * Log in with the auth payload.
   * @param payload - {ScuteTokenPayload}
   */
  async signInWithTokenPayload(payload: ScuteTokenPayload) {
    await this.setSession(payload);
    const session = await this.scuteSession.initialState();

    const { data: user, error: getUserError } = await this.getUser(
      session.access
    );

    if (getUserError) {
      return { error: getUserError };
    }

    if (!user) {
      this.scuteSession.removeSession();
      return { error: null };
    }

    // TODO: email or phone or somehow input identifier ?
    this._setRememberedIdentifier(user.email);

    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.SIGN_IN, session, user);

    return { error: null };
  }

  /**
   * Log out a user by deleting their auth token in the storage and revoking their refresh token.
   * @returns true if the refresh token is revoked successfully.
   */
  async signOut(): Promise<boolean> {
    const {
      data: {
        session: { access: accessToken },
      },
    } = await this._getSession();

    await this.scuteSession.removeSession();
    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.SIGN_OUT);

    if (accessToken) {
      const { error: signOutError } = await this.admin.signOut(accessToken);

      if (signOutError) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check for an identifier and return the user if any.
   * @param identifier {ScuteIdentifier}
   * @returns {Promise<ScuteUser | null>}
   */
  async identifierExists(
    identifier: ScuteIdentifier
  ): Promise<ScuteUser | null> {
    const { data } = await this._getUserByIdentifier(identifier);
    return data ? data.user : null;
  }

  /**
   * @param identifier {ScuteIdentifier}
   * @returns true if exists and verified
   * @internal
   * @see {identifierExists}
   */
  private async _identifierExistsAndVerified(
    identifier: ScuteIdentifier
  ): Promise<boolean> {
    const user = await this.identifierExists(identifier);
    return Boolean(user && (user.email_verified || user.phone_verified));
  }

  /**
   * @param identifier {ScuteIdentifier}
   * @internal
   * @see {identifierExists}
   */
  private async _getUserByIdentifier(identifier: ScuteIdentifier) {
    return this.get<{ user: ScuteUser | null }>(
      `/user?identifier=${identifier}`
    );
  }

  /**
   * @param userId {UniqueIdentifier}
   * @internal
   */
  private async _getUserByUserId(userId: UniqueIdentifier) {
    return this.get<{ user: ScuteUser | null }>(`/user?user_id=${userId}`);
  }

  /**
   * Get current session.
   * @returns Session
   */
  async getSession() {
    // initialize with cache
    await this._initialize();

    return this._getSession(true);
  }

  /**
   * @param serverCheck {boolean}
   * @internal
   * @see {getSession}
   */
  private async _getSession(serverCheck?: boolean) {
    let session = await this.scuteSession.initialState();
    let user: ScuteUser | null = null;

    if (this.autoRefreshToken) {
      // refresh silently
      const { data: refreshedSession, error: refreshError } =
        await this._maybeRefreshSilently(session);

      if (refreshError) {
        return {
          data: { session: ScuteSession.unAuthenticatedState(), user: null },
          error: refreshError,
        };
      }

      session = refreshedSession;
    }

    if (serverCheck && session.access) {
      const { data: currentUser, error: getUserError } =
        await this.getCurrentUser(session.access);

      if (getUserError) {
        return {
          data: { session: ScuteSession.unAuthenticatedState(), user: null },
          error: getUserError,
        };
      }
      user = currentUser;
    }

    return { data: { session, user }, error: null };
  }

  /**
   * Refresh silently if the access token expires.
   * @internal
   * @see {refresh}
   */
  private async _maybeRefreshSilently(session: Session) {
    let error: ScuteError | null = null;

    if (
      session.refresh &&
      session.csrf &&
      session.accessExpiresAt !== null &&
      new Date() >= session.accessExpiresAt
    ) {
      return this.refresh(session);
    }

    return { data: session, error };
  }

  /**
   * Refresh and save new auth token using refresh token.
   * @param session - Session
   */
  async refresh(session?: Session | null) {
    let error: ScuteError | null = null;

    if (!session) {
      session = await this.scuteSession.initialState();
    }

    if (error) {
      return { data: session, error };
    }

    if (!session.refresh || !session.csrf) {
      return { data: session, error };
    }

    const { data: tokenPayload, error: refreshError } = await this._refresh(
      session.refresh,
      session.csrf
    );

    if (refreshError) {
      // sign out on error
      await this.signOut();
      error = refreshError;
    } else {
      await this.setSession(tokenPayload);
      session = await this.scuteSession.initialState();
    }

    if (!error) {
      this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.TOKEN_REFRESH);
    }

    return { data: session, error };
  }

  /**
   * Set session to the storage. If persistence is not disabled
   * session will remain between hard refreshes.
   * @param payload - {ScuteTokenPayload}
   */
  async setSession(payload: ScuteTokenPayload) {
    if (!payload || !payload.access || !payload.refresh) {
      this.scuteSession.removeSession();
    }

    const _session: Session = {
      access: payload.access,
      refresh: payload.refresh,
      csrf: payload.csrf,
      accessExpiresAt: new Date(payload.access_expires_at),
      refreshExpiresAt: new Date(payload.refresh_expires_at),
      status: "authenticated",
    };

    await this.scuteSession.sync(_session);
  }

  /**
   * Get the user by current session or by an auth token.
   * @param accessToken Auth token.
   */
  async getUser(accessToken?: string | null) {
    if (!accessToken) {
      const { data: access, error } = await this._getAuthToken();
      if (error) {
        return { data: null, error };
      }
      accessToken = access;
    }

    return this.getCurrentUser(accessToken);
  }

  /**
   * Get the access token from the current session.
   * @internal
   * @see {ScuteSession}
   */
  private async _getAuthToken() {
    const session = await this.scuteSession.initialState();

    if (!session.access) {
      return { data: null, error: loginRequiredError() };
    }

    return { data: session.access, error: null };
  }

  /**
   * @param accessToken - Auth token
   * @internal
   * @see {getUser}
   */
  protected async getCurrentUser(accessToken: string) {
    const { data, error } = await this._getCurrentUserRequest(accessToken);

    if (error && error.code === 401) {
      return { data: null, error: loginRequiredError() };
    }

    return { data, error };
  }

  /**
   * @param accessToken - Auth token
   * @internal
   * @see {getUser}
   */
  private async _getCurrentUserRequest(accessToken: string) {
    return this.get<ScuteUser | null>(
      "/current_user",
      this._accessTokenHeader(accessToken)
    );
  }

  /**
   * @param identifier {ScuteIdentifier}
   * @internal
   */
  private async _setRememberedIdentifier(identifier: ScuteIdentifier) {
    return this.scuteSession.setRememberedIdentifier(identifier);
  }

  /**
   * Get remembered (last logged) identifier.
   */
  async getRememberedIdentifier(): Promise<ScuteIdentifier | null> {
    const identifier = await this.scuteSession.getRememberedIdentifier();
    return identifier;
  }

  /**
   * Clear remembered (last logged) identifier.
   */
  async clearRememberedIdentifier() {
    return this.storage.removeItem(SCUTE_LAST_LOGIN_STORAGE_KEY);
  }

  /**
   * Check if webauthn is supported on this device.
   * @returns true if webauthn is supported on this device, false otherwise.
   */
  isWebauthnSupported(): boolean {
    return isWebauthnSupported();
  }

  /**
   * Initializes webauthn register.
   * * Needs access token.
   *
   * @param accessToken - Access token
   */
  async webauthnInitializeRegister(accessToken: string) {
    return this._webauthnDeviceRegisterInitializeRequest(accessToken);
  }

  /**
   * Finalizes webauthn register by attempting popup
   * and sending credential to the server.
   * * Needs access token.
   *
   * @param options - Credential creation options
   * @param accessToken - Auth token
   */
  async webauthnFinalizeRegister(
    options: webauthn.CredentialCreationOptionsJSON,
    accessToken: string
  ) {
    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.BIO_REGISTER);

    const userId = getUserIdFromAccessToken(accessToken);

    try {
      const credential = await webauthn.create(options);
      this._storeCredentialId(userId, credential.id);

      return this._webauthnDeviceRegisterFinalizeRequest(
        credential,
        accessToken
      );
    } catch (error) {
      return {
        data: null,
        error: identifyRegistrationError({
          //@ts-ignore
          error,
          options,
        }),
      };
    }
  }

  /**
   * @param accessToken - Auth token
   * @internal
   * @see {webauthnInitializeRegister}
   */
  private async _webauthnDeviceRegisterInitializeRequest(accessToken: string) {
    return this.post<{
      options: webauthn.CredentialCreationOptionsJSON["publicKey"];
    }>("/devices/register", undefined, this._accessTokenHeader(accessToken));
  }

  /**
   * @param credential - Credential Attestation
   * @param accessToken - Auth token
   * @internal
   * @see {webauthnFinalizeRegister}
   */
  private async _webauthnDeviceRegisterFinalizeRequest(
    credential: webauthn.PublicKeyCredentialWithAttestationJSON,
    accessToken: string
  ) {
    return this.post<ScuteDevice>(
      "/devices/finalize",
      credential,
      this._accessTokenHeader(accessToken)
    );
  }

  /**
   * Initialize webauthn login.
   * @param identifier {ScuteIdentifier}
   */
  async webauthnInitializeLogin(identifier: ScuteIdentifier) {
    return this._webauthnInitializeLoginRequest(identifier);
  }

  /**
   * Finalizes webauthn login by attempting popup
   * and sending credential to the server.
   *
   * @param options - Credential request options
   */
  async webauthnFinalizeLogin(options: webauthn.CredentialRequestOptionsJSON) {
    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.BIO_VERIFY);

    try {
      const credential = await webauthn.get(options);
      const { data, error: finalizeError } =
        await this._webauthnFinalizeLoginRequest(credential);

      if (finalizeError) {
        return { data: null, error: finalizeError };
      }

      this._storeCredentialId(data.user_id, credential.id);

      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error: identifyAuthenticationError({
          error: error as any,
          options: options as any,
        }),
      };
    }
  }

  /**
   * @param identifier {ScuteIdentifier}
   * @internal
   * @see {webauthnInitializeLogin}
   */
  private async _webauthnInitializeLoginRequest(identifier: ScuteIdentifier) {
    return this.post<{
      options: webauthn.CredentialRequestOptionsJSON["publicKey"];
    }>("/webauthn/login/initialize", {
      identifier,
    });
  }

  /**
   * @param credential - Credential Attestation
   * @internal
   * @see {webauthnFinalizeLogin}
   */
  private async _webauthnFinalizeLoginRequest(
    credential: webauthn.PublicKeyCredentialWithAssertionJSON
  ) {
    return this.post<ScuteTokenPayload>("/webauthn/login/finalize", credential);
  }

  /**
   *
   * @param userId {UniqueIdentifier}
   * @param options - Webauthn credential request options
   * @returns true if the credential id is not found in the browser and server.
   */
  private async _webauthnIsNewDevice(
    userId: UniqueIdentifier,
    options: webauthn.CredentialRequestOptionsJSON["publicKey"]
  ): Promise<boolean> {
    const credentialIds = await this._getCredentialIds(userId);

    const isNewDevice =
      credentialIds.length === 0 ||
      !options?.allowCredentials?.some((credential) =>
        credentialIds.includes(credential.id)
      );
    return isNewDevice;
  }

  /**
   * Send login magic link and emit the pending event.
   */
  async sendLoginMagicLink(identifier: ScuteIdentifier, webauthnEnabled?: boolean) {
    const { data, error } = await this._sendMagicLinkRequest(
      identifier,
      "login",
      webauthnEnabled
    );

    if (!error) {
      this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.MAGIC_PENDING);
    }

    return { data, error };
  }

  /**
   * Send register magic link and emit the pending event.
   */
  async sendRegisterMagicLink(identifier: ScuteIdentifier, webauthnEnabled?: boolean) {
    const { data, error } = await this._sendMagicLinkRequest(
      identifier,
      "register",
      webauthnEnabled
    );

    if (!error) {
      this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.MAGIC_PENDING);
    }

    return { data, error };
  }

  /**
   * Send magic link request.
   * @internal
   * @see {sendLoginMagicLink}
   * @see {sendRegisterMagicLink}
   */
  private async _sendMagicLinkRequest(
    identifier: ScuteIdentifier,
    method: "register" | "login" = "login",
    webauthnEnabled = isWebauthnSupported()
  ) {
    return this.post<ScuteMagicLinkIdResponse>(`/magic_links/${method}`, {
      identifier,
      webauthn_enabled: webauthnEnabled ?? isWebauthnSupported(),
    });
  }

  /**
   * Get access token if the magic link consumed.
   * @param id Magic link status id
   */
  async getMagicLinkStatus(id: UniqueIdentifier) {
    return this.post<ScuteTokenPayload>("/magic_links/status", {
      id,
    });
  }

  /**
   * Verify magic link token
   * @param token Magic link token (sct_magic)
   */
  async verifyMagicLink(token: string) {
    return this.patch<ScuteTokenPayload>("/magic_links/authenticate", {
      token,
    });
  }

  /**
   * Get credential store for new device checks.
   * @internal
   */
  private async _getCredentialStore() {
    const credData = await this.storage.getItem(SCUTE_CRED_STORAGE_KEY);
    const parsed = credData ? JSON.parse(credData) : {};

    return parsed;
  }

  /**
   * Get all stored credential ids as array.
   * @param userId {UniqueIdentifier}
   */
  private async _getCredentialIds(userId: UniqueIdentifier): Promise<string[]> {
    const store = await this._getCredentialStore();
    return Array.isArray(store[userId]) ? store[userId] : [store[userId]];
  }

  /**
   * Store credential id.
   * @param userId {UniqueIdentifier}
   * @param credentialId {UniqueIdentifier}
   * @internal
   */
  private async _storeCredentialId(
    userId: UniqueIdentifier,
    credentialId: UniqueIdentifier
  ) {
    return this.storage.setItem(
      SCUTE_CRED_STORAGE_KEY,
      JSON.stringify({
        ...this._getCredentialStore(),
        [userId]: Array.from(
          new Set(
            [...(await this._getCredentialIds(userId)), credentialId].filter(
              Boolean
            )
          )
        ),
      })
    );
  }

  /**
   * @internal
   * @see {refresh}
   */
  private async _refresh(jwt: string, csrf: string) {
    return this.post<ScuteTokenPayload>(
      "/auth/refresh",
      null,
      this._refreshTokenHeaders(jwt, csrf)
    );
  }

  /**
   * Emit an auth event so it can be listened to with onAuthStateChange.
   * @param event {AuthChangeEvent}
   * @param session {Session}
   * @param user {ScuteUser}
   * @internal
   * @see {onAuthStateChange}
   */
  protected emitAuthChangeEvent(
    event: AuthChangeEvent,
    session?: Session,
    user?: ScuteUser
  ) {
    this.emitter.emit(INTERNAL_EVENTS.AUTH_STATE_CHANGED, {
      event,
      session,
      user,
    });
  }

  /**
   * Get access token header object.
   */
  private _accessTokenHeader(jwt: string | null): HeadersInit {
    if (!jwt) return {};

    return {
      "X-Authorization": `Bearer ${jwt}`,
    };
  }

  /**
   * Get refresh token headers object.
   */
  private _refreshTokenHeaders(
    jwt: string | null,
    csrf: string | null
  ): HeadersInit {
    if (!jwt || !csrf) return {};

    return {
      "X-Refresh-Token": jwt,
      "X-CSRF-Token": csrf,
    };
  }
}

/**
 * Create a new ScuteClient.
 * @returns {ScuteClient}
 */
export const createClient = (
  ...params: ConstructorParameters<typeof ScuteClient>
) => new ScuteClient(...params);
