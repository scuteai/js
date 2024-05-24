import mitt, { type Emitter, type Handler } from "mitt";

import ScuteAdminApi from "./ScuteAdminApi";
import { ScuteBaseHttp } from "./lib/ScuteBaseHttp";
import { ScuteSession, sessionUnAuthenticatedState } from "./lib/ScuteSession";
import {
  ScuteCookieStorage,
  ScuteNoneStorage,
  ScuteStorage,
} from "./lib/ScuteStorage";

import {
  type AuthChangeEvent,
  AUTH_CHANGE_EVENTS,
  type InternalEvent,
  INTERNAL_EVENTS,
  SCUTE_BROADCAST_CHANNEL,
  SCUTE_MAGIC_PARAM,
} from "./lib/constants";

import {
  accessTokenHeader,
  decodeAccessToken,
  decodeMagicLinkToken,
  Deferred,
  isBrowser,
  isWebauthnSupported,
  refreshTokenHeaders,
} from "./lib/helpers";

import Mixin from "./lib/mixin";
import webauthn from "./lib/webauthn";

import {
  IdentifierAlreadyExistsError,
  IdentifierNotRecognizedError,
  identifyAuthenticationError,
  identifyRegistrationError,
  InvalidMagicLinkError,
  LoginRequiredError,
  InvalidAuthTokenError,
  NewDeviceError,
  ScuteError,
  TechnicalError,
  UnknownSignInError,
} from "./lib/errors";

import { version } from "./lib/version";

import type {
  _ScuteAccessPayload,
  _ScuteRefreshPayload,
} from "./lib/types/internal";

import type { AuthenticatedSession, Session } from "./lib/types/session";
import type { UniqueIdentifier } from "./lib/types/general";

import type {
  ScuteClientConfig,
  ScuteClientPreferences,
} from "./lib/types/config";

import type {
  ScuteAppData,
  ScuteUserSession,
  ScuteIdentifier,
  ScuteMagicLinkIdResponse,
  ScuteSignInOptions,
  ScuteSignInOrUpOptions,
  ScuteSignUpOptions,
  ScuteTokenPayload,
  ScuteUser,
  ScuteUserData,
  UserMeta,
} from "./lib/types/scute";

class ScuteClient extends Mixin(ScuteBaseHttp, ScuteSession) {
  protected readonly appId: ScuteClientConfig["appId"];
  protected appData!: ScuteAppData;

  protected readonly config: {
    persistSession: ScuteClientPreferences["persistSession"];
    autoRefreshToken: boolean;
    refetchOnWindowFocus: ScuteClientPreferences["refetchOnWindowFocus"];
    refetchInverval: ScuteClientPreferences["refetchInverval"];
  };

  readonly admin: ScuteAdminApi;

  protected readonly scuteStorage: ScuteStorage | ScuteCookieStorage;
  protected readonly emitter: Emitter<InternalEvent>;
  protected readonly channel: BroadcastChannel | null = null;

  private static nextInstanceID = 0;
  private instanceID = 0;
  protected logDebugMessages = false;

  protected initializeDeferred: Deferred<{ error: ScuteError | null }> | null =
    null;
  protected getCurrentUserDeferred: Deferred<
    Awaited<ReturnType<ScuteClient["_getCurrentUser"]>>
  > | null = null;

  constructor(config: ScuteClientConfig) {
    const baseUrl = config.baseUrl || "https://api.scute.io";
    const appId = config.appId;

    if (!appId) {
      throw new ScuteError({
        message: "Scute appId is required!",
      });
    }

    const browser = isBrowser();

    const endpointPrefix = `/v1/auth/${appId}`;
    super(`${baseUrl}${endpointPrefix}`, {
      credentials: "include",
    });

    if (browser) {
      this.instanceID = ScuteClient.nextInstanceID;
      ScuteClient.nextInstanceID += 1;

      if (this.instanceID > 0) {
        console.warn(
          "Multiple ScuteClient instances detected in the same browser context. Although it is not an error, but this should be avoided as it may produce undefined behavior."
        );
      }
    }

    this.logDebugMessages = config.debug === true;

    this.appId = appId;

    this.config = {
      persistSession: config.preferences?.persistSession !== false,
      autoRefreshToken: true, // default
      refetchOnWindowFocus: config.preferences?.refetchOnWindowFocus !== false,
      refetchInverval: config.preferences?.refetchInverval ?? 60 * 5,
    };

    this.scuteStorage =
      browser && typeof window !== "undefined" && window.localStorage
        ? // supressing, sync -> async
          (window.localStorage as any)
        : ScuteNoneStorage;

    if (config.preferences?.sessionStorageAdapter) {
      this.scuteStorage = config.preferences.sessionStorageAdapter;
    }

    if (!this.config.persistSession) {
      this.scuteStorage = ScuteNoneStorage;
    }

    this.admin = new ScuteAdminApi({
      appId,
      baseUrl,
      secretKey: config.secretKey,
    });

    this.emitter = mitt<InternalEvent>();

    if (browser) {
      this.channel = new BroadcastChannel(SCUTE_BROADCAST_CHANNEL);
    }

    this._initialize();
  }

  /**
   * Initializes the client SDK (making sure it is initialized only once).
   * @internal
   */
  protected async _initialize() {
    if (this.initializeDeferred) {
      return this.initializeDeferred.promise;
    }

    this.debug("#_initialize", "start");
    this.initializeDeferred = new Deferred();

    try {
      const { error: appDataError } = await this._initializeAppData();
      if (!appDataError) {
        if (isBrowser()) {
          if (this.config.persistSession) {
            // only when persisting the session and running in the browser
            this._setupSessionBroadcast();
          }

          this.config.autoRefreshToken = this.appData.auto_refresh !== false;

          await this.registerVisibilityChange();
          await this.registerRefetchInterval();
        }
      }

      this.initializeDeferred.resolve({ error: appDataError });
    } catch {
      this.initializeDeferred.reject();
    }

    this.debug("#_initialize", "end");
    return this.initializeDeferred.promise;
  }

  protected debug(...args: any[]) {
    const instanceStr =
      isBrowser() && this.instanceID > 0 ? `@${this.instanceID}` : "";

    if (this.logDebugMessages) {
      console.debug(
        `ScuteClient${instanceStr} (${version}) ${new Date().toISOString()}`,
        ...args
      );
    }
  }

  /**
   * Get app config data.
   * `fresh` needs to be set to `true` to get the latest data from the server.
   *
   * @param fresh - fetch new data from the server instead cached
   */
  async getAppData(fresh = false) {
    const { error } = await this._initializeAppData(fresh);

    if (error) {
      return { data: null, error };
    }

    return { data: this.appData, error: null };
  }

  /**
   * @param fresh - fetch new data from the server
   * @internal
   * @see {@link getAppData}
   */
  private async _initializeAppData(fresh = false) {
    if (fresh || !this.appData) {
      const { data: appData, error } = await this.admin.getAppData();
      if (error) {
        return { error };
      } else {
        this.appData = appData;
      }
    }

    return { error: null };
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
      if (msg.data.type === INTERNAL_EVENTS.AUTH_STATE_CHANGED) {
        this.emitter.emit(INTERNAL_EVENTS.AUTH_STATE_CHANGED, {
          ...msg.data.payload,
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
    callback: <T extends Session>(
      event: AuthChangeEvent,
      session: T,
      user: T extends AuthenticatedSession ? ScuteUserData : null
    ) => void
  ) {
    const sessionEvents: AuthChangeEvent[] = [
      AUTH_CHANGE_EVENTS.INITIAL_SESSION,
      AUTH_CHANGE_EVENTS.SESSION_EXPIRED,
      AUTH_CHANGE_EVENTS.SESSION_REFETCH,
      AUTH_CHANGE_EVENTS.TOKEN_REFRESHED,
      AUTH_CHANGE_EVENTS.SIGNED_IN,
      AUTH_CHANGE_EVENTS.SIGNED_OUT,
      AUTH_CHANGE_EVENTS.WEBAUTHN_REGISTER_START,
      AUTH_CHANGE_EVENTS.WEBAUTHN_REGISTER_SUCCESS,
    ];

    const handler: Handler<
      InternalEvent[typeof INTERNAL_EVENTS.AUTH_STATE_CHANGED]
    > = async ({ event, session, user }) => {
      if (
        sessionEvents.includes(event) &&
        (!session || (session.access !== null && !user))
      ) {
        // if user is passed, this means server check already happened
        // otherwise in specific events, refetch user
        const force =
          !user &&
          (event === AUTH_CHANGE_EVENTS.INITIAL_SESSION ||
            event === AUTH_CHANGE_EVENTS.TOKEN_REFRESHED ||
            event === AUTH_CHANGE_EVENTS.WEBAUTHN_REGISTER_START ||
            event === AUTH_CHANGE_EVENTS.WEBAUTHN_REGISTER_SUCCESS);

        const emitRefetchEvent = !force;

        ({
          data: { session, user },
        } = await this._getSession(force, emitRefetchEvent));
      }

      callback(event, session ?? sessionUnAuthenticatedState(), user ?? null);
    };

    this.emitter.on(INTERNAL_EVENTS.AUTH_STATE_CHANGED, handler);
    handler({ event: AUTH_CHANGE_EVENTS.INITIAL_SESSION });

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
    const { data, error } = await this._identifierExists(identifier);
    if (error) {
      return { data: null, error };
    }

    const user = data.user;
    if (!user) {
      return {
        data: null,
        error: new IdentifierNotRecognizedError(),
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
   * @see {@link signIn}
   * @see {@link signUp}
   */
  async signInOrUp(
    identifier: ScuteIdentifier,
    options?: ScuteSignInOrUpOptions
  ) {
    const { data, error } = await this._identifierExists(identifier);
    if (error) {
      return { data: null, error };
    }

    const user = data.user;

    return user
      ? this._signIn(identifier, user, options)
      : this._signUp(identifier, options);
  }

  /**
   * Log in.
   * @internal
   * @see {@link signIn}
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
        if (verifyError instanceof NewDeviceError) {
          this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.MAGIC_NEW_DEVICE_PENDING);
          return this._sendLoginMagicLink(identifier);
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
   * @returns Polling data if magic link is usable.
   */
  async signUp(identifier: ScuteIdentifier, options?: ScuteSignUpOptions) {
    const { data, error } = await this._identifierExists(identifier);

    if (error) {
      return { data: null, error };
    }

    const user = data.user;
    if (user && (user.email_verified || user.phone_verified)) {
      return {
        data: null,
        error: new IdentifierAlreadyExistsError(),
      };
    }

    return this._signUp(identifier, options);
  }

  /**
   * Creates a user.
   * @internal
   * @see {@link signUp}
   */
  private async _signUp(
    identifier: ScuteIdentifier,
    options?: ScuteSignUpOptions
  ) {
    return this.sendRegisterMagicLink(identifier, options?.userMeta);
  }

  /**
   * Log in with magic link token.
   * @param token - Magic link token (sct_magic)
   */
  async signInWithMagicLinkToken(token: string) {
    const { data, error: verifyError } = await this.verifyMagicLinkToken(token);
    if (verifyError) return { error: verifyError };

    return this.signInWithTokenPayload(data.authPayload);
  }

  /**
   * Log in with the magic link url.
   * @param url - (Optional) magic link url with sct_magic param. Default `window.location.href`.
   */
  async signInWithMagicLink(url?: string | URL) {
    const token = this.getMagicLinkToken(url);

    if (!token) {
      return { error: new InvalidMagicLinkError() };
    }

    return this.signInWithMagicLinkToken(token);
  }

  /**
   * Log in with the magic link status id if it is consumed.
   * @param id {UniqueIdentifier} - Magic link status id
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
   * Get if the URL has magic link token.
   * @param url - (Optional) magic link url with sct_magic param. Default `window.location.href`.
   */
  getMagicLinkToken(url?: string | URL) {
    const token = new URL(url ?? window.location.href).searchParams.get(
      SCUTE_MAGIC_PARAM
    );

    return token;
  }

  /**
   * Verify the magic link url.
   * @param url - (Optional) magic link url with sct_magic param. Default `window.location.href`.
   */
  async verifyMagicLink(url?: string | URL) {
    const token = this.getMagicLinkToken(url);

    if (!token) {
      return { error: new InvalidMagicLinkError() };
    }

    return this.verifyMagicLinkToken(token);
  }

  /**
   * Verify magic link token
   * @param token - Magic link token (sct_magic)
   */
  async verifyMagicLinkToken(token: string) {
    const decodedMagicLinkToken = decodeMagicLinkToken(token);
    if (!decodedMagicLinkToken) {
      return {
        data: null,
        error: new InvalidMagicLinkError(),
      };
    }

    const { data: authPayload, error: verifyError } =
      await this._verifyMagicLinkTokenRequest(token);

    if (verifyError) {
      return { data: null, error: verifyError };
    }

    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.MAGIC_VERIFIED);

    return {
      data: { authPayload, magicPayload: decodedMagicLinkToken },
      error: null,
    };
  }

  /**
   * Verify magic link token
   * @param token - Magic link token (sct_magic)
   * @internal
   * @see {@link verifyMagicLinkToken}
   */
  private async _verifyMagicLinkTokenRequest(token: string) {
    return this.patch<ScuteTokenPayload>("/magic_links/authenticate", {
      token,
    });
  }

  /**
   * Register device for webauthn. This method will trigger the browser popup.
   * @returns Scute Device
   */
  async addDevice() {
    const { data, error } = await this.getAuthToken();

    if (error) {
      return { data: null, error };
    }

    return this._addDevice(data.access);
  }

  /**
   * @param accessToken - Auth token
   * @internal
   * @see {@link addDevice}
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
   * Log in with registering the current device.
   * @param payload {ScuteTokenPayload} - Scute auth payload
   */
  async signInWithRegisterDevice(payload: ScuteTokenPayload) {
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
    const { data, error } = await this._identifierExists(identifier);
    if (error) {
      return { error };
    }

    const user = data.user;
    if (!user) {
      return {
        error: new IdentifierNotRecognizedError(),
      };
    }

    return this._signInWithVerifyDevice(identifier, user.id);
  }

  /**
   * @param identifier {ScuteIdentifier}
   * @param userId {UniqueIdentifier}
   * @internal
   * @see {@link signInWithVerifyDevice}
   */
  private async _signInWithVerifyDevice(
    identifier: ScuteIdentifier,
    userId: UniqueIdentifier
  ) {
    const { data, error: initializeError } = await this.webauthnInitializeLogin(
      identifier
    );
    if (initializeError) return { error: initializeError };

    const isNewDevice = await this._webauthnIsNewDevice(userId, data.options);
    if (isNewDevice) {
      return {
        error: new NewDeviceError(),
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
   * Log in with the auth payload.
   * @param payload {ScuteTokenPayload} - Scute auth payload
   */
  async signInWithTokenPayload(payload: ScuteTokenPayload) {
    const session = (await this.setSession(payload)) as AuthenticatedSession;
    const { data, error: getUserError } = await this.getCurrentUser(
      session.access
    );

    if (getUserError) {
      // something went wrong
      await this._signOut(session.access);
      return {
        error: new UnknownSignInError(),
      };
    }

    const user = data.user;

    // TODO(backlog): email or phone or somehow input identifier ?
    // maybe show only some digits on phone number ?
    if (user.email) {
      this.setRememberedIdentifier(user.email);
    }

    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.SIGNED_IN, session, user);

    return { error: null };
  }

  /**
   * Log out a user by deleting their auth token in the storage and revoking their refresh token.
   * @returns true if the refresh token is revoked successfully.
   */
  async signOut(): Promise<boolean> {
    const { data } = await this._getSession();

    this.emitAuthChangeEvent(
      AUTH_CHANGE_EVENTS.SIGNED_OUT,
      sessionUnAuthenticatedState()
    );

    const session = data.session;
    return this._signOut(session?.access);
  }

  /**
   * Check for an identifier and return the user if any.
   * @param identifier {ScuteIdentifier}
   * @returns {Promise<ScuteUser | null>}
   * @throws {@link TechnicalError}
   */
  async identifierExists(
    identifier: ScuteIdentifier
  ): Promise<ScuteUser | null> {
    const { data, error } = await this._identifierExists(identifier);

    if (error) {
      throw error;
    }

    return data.user;
  }

  /**
   * @internal
   * @see {@link identifierExists}
   */
  protected async _identifierExists(identifier: ScuteIdentifier) {
    const { data, error } = await this.admin.getUserByIdentifier(identifier);

    if (error) {
      return { data: null, error: new TechnicalError() };
    }

    return { data, error: null };
  }

  /**
   * Get the access token from the current session.
   */
  async getAuthToken() {
    const session = await this.initialSessionState();

    return this._getAuthToken(session);
  }

  /**
   * Get the user by current session or by an auth token.
   * @param accessToken Auth token.
   */
  async getUser(accessToken?: string | null) {
    if (!accessToken) {
      const { data: authData, error } = await this.getAuthToken();
      if (error) {
        return { data: { user: null }, error };
      }

      accessToken = authData.access;
    }

    return this.getCurrentUser(accessToken);
  }

  /**
   * @param accessToken - Auth token
   * @internal
   * @see {@link getUser}
   */
  protected async getCurrentUser(
    ...params: Parameters<typeof this._getCurrentUser>
  ) {
    if (this.getCurrentUserDeferred) {
      return this.getCurrentUserDeferred.promise;
    }

    this.getCurrentUserDeferred = new Deferred();
    const response = await this._getCurrentUser(...params);

    this.getCurrentUserDeferred.resolve(response);
    this.getCurrentUserDeferred = null;

    return response;
  }

  /**
   * @param accessToken - Auth token
   * @internal
   * @see {@link getCurrentUser}
   */
  private async _getCurrentUser(accessToken: string) {
    const { data, error } = await this._getCurrentUserRequest(accessToken);

    if (error) {
      return {
        data: { user: null },
        error: error.code === 401 ? new InvalidAuthTokenError() : error,
      };
    }

    return { data: { user: data.user as NonNullable<ScuteUserData> }, error };
  }

  /**
   * @param accessToken - Auth token
   * @internal
   * @see {@link getUser}
   */
  private async _getCurrentUserRequest(accessToken: string) {
    return this.get<{ user: ScuteUserData | null }>(
      "/current_user",
      accessTokenHeader(accessToken)
    );
  }

  /**
   * Check if webauthn is supported on this device.
   * @returns true if webauthn is supported on this device, false otherwise.
   */
  isWebauthnSupported(): boolean {
    return isWebauthnSupported();
  }

  /**
   * Check if any webauthn device registered on this device with the current user.
   * @returns true if any webauthn credential is registered on this device with the current user, false otherwise.
   * @throws {@link LoginRequiredError}
   */
  async isAnyDeviceRegistered(): Promise<boolean> {
    const { data, error } = await this.getAuthToken();
    const decodedAccess = data?.access ? decodeAccessToken(data.access) : null;

    if (error || !decodedAccess?.userId) {
      throw new LoginRequiredError();
    }

    const credentialIds = await this.getCredentialIds(decodedAccess.userId);
    return credentialIds.length > 0;
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
    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.WEBAUTHN_REGISTER_START);
    const decodedToken = decodeAccessToken(accessToken);

    if (!decodedToken) {
      return { data: null, error: new TechnicalError() };
    }

    let credential: webauthn.PublicKeyCredentialWithAttestationJSON;
    try {
      credential = await webauthn.create(options);
    } catch (error: any) {
      return {
        data: null,
        error: identifyRegistrationError({
          error,
          options,
        }),
      };
    }

    this.storeCredentialId(decodedToken.userId, credential.id);

    const { data, error: finalizeError } =
      await this._webauthnDeviceRegisterFinalizeRequest(
        credential,
        accessToken
      );

    if (finalizeError) {
      return { data: null, error: finalizeError };
    }

    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.WEBAUTHN_REGISTER_SUCCESS);

    return { data, error: null };
  }

  /**
   * @param accessToken - Auth token
   * @internal
   * @see {@link webauthnInitializeRegister}
   */
  private async _webauthnDeviceRegisterInitializeRequest(accessToken: string) {
    return this.post<{
      options: webauthn.CredentialCreationOptionsJSON["publicKey"];
    }>("/devices/register", undefined, accessTokenHeader(accessToken));
  }

  /**
   * @param credential - Credential Attestation
   * @param accessToken - Auth token
   * @internal
   * @see {@link webauthnFinalizeRegister}
   */
  private async _webauthnDeviceRegisterFinalizeRequest(
    credential: webauthn.PublicKeyCredentialWithAttestationJSON,
    accessToken: string
  ) {
    return this.post<ScuteUserSession>(
      "/devices/finalize",
      credential,
      accessTokenHeader(accessToken)
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
   * @param options {webauthn.CredentialRequestOptionsJSON} - Credential request options
   */
  async webauthnFinalizeLogin(options: webauthn.CredentialRequestOptionsJSON) {
    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.WEBAUTHN_VERIFY_START);

    let credential: webauthn.PublicKeyCredentialWithAssertionJSON;
    try {
      credential = await webauthn.get(options);
    } catch (error: any) {
      return {
        data: null,
        error: identifyAuthenticationError({
          error,
          options,
        }),
      };
    }

    const { data, error: finalizeError } =
      await this._webauthnFinalizeLoginRequest(credential);

    if (finalizeError) {
      return { data: null, error: finalizeError };
    }

    const decodedAccess = decodeAccessToken(data.access);
    if (!decodedAccess) {
      return { data: null, error: new TechnicalError() };
    }

    this.storeCredentialId(decodedAccess.userId, credential.id);
    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.WEBAUTHN_VERIFY_SUCCESS);

    return { data, error: null };
  }

  /**
   * @param identifier {ScuteIdentifier}
   * @internal
   * @see {@link webauthnInitializeLogin}
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
   * @see {@link webauthnFinalizeLogin}
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
    const credentialIds = await this.getCredentialIds(userId);

    const isNewDevice =
      credentialIds.length === 0 ||
      !options?.allowCredentials?.some((credential) =>
        credentialIds.includes(credential.id)
      );
    return isNewDevice;
  }

  /**
   * Send login magic link and emit the pending event.
   * @param identifier {ScuteIdentifier}
   * @param webauthnEnabled {boolean} - Magic link token includes this in the payload
   * @param emitEvent {boolean} - Emit pending event. Default true.
   */
  async sendLoginMagicLink(
    identifier: ScuteIdentifier,
    webauthnEnabled?: boolean,
    emitEvent: boolean = true
  ) {
    const response = await this._sendLoginMagicLink(
      identifier,
      webauthnEnabled
    );

    if (!response.error && emitEvent) {
      this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.MAGIC_PENDING);
    }

    return response;
  }

  /**
   * Send login magic link.
   * @param identifier {ScuteIdentifier}
   * @param webauthnEnabled {boolean}
   * @internal
   * @see {@link sendLoginMagicLink}
   */
  private async _sendLoginMagicLink(
    identifier: ScuteIdentifier,
    webauthnEnabled?: boolean
  ) {
    return this._sendMagicLinkRequest(
      identifier,
      "login",
      undefined,
      webauthnEnabled
    );
  }

  /**
   * Send register magic link and emit the pending event.
   * @param identifier {ScuteIdentifier}
   * @param webauthnEnabled {boolean}
   * @param emitEvent {boolean} - Emit pending event. Default true.
   */
  async sendRegisterMagicLink(
    identifier: ScuteIdentifier,
    userMeta?: UserMeta,
    webauthnEnabled?: boolean,
    emitEvent: boolean = true
  ) {
    const { data, error } = await this._sendRegisterMagicLink(
      identifier,
      userMeta,
      webauthnEnabled
    );

    if (error) {
      return { data: null, error };
    }

    if (emitEvent) {
      this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.MAGIC_PENDING);
    }

    return { data, error: null };
  }

  /**
   * Send register magic link.
   * @param identifier {ScuteIdentifier}
   * @param userMeta {UserMeta}
   * @param webauthnEnabled {boolean}
   * @internal
   * @see {@link sendRegisterMagicLink}
   */
  private async _sendRegisterMagicLink(
    identifier: ScuteIdentifier,
    userMeta?: UserMeta,
    webauthnEnabled?: boolean
  ) {
    return this._sendMagicLinkRequest(
      identifier,
      "register",
      userMeta,
      webauthnEnabled
    );
  }

  /**
   * Send magic link request.
   * @internal
   * @see {@link sendLoginMagicLink}
   * @see {@link sendRegisterMagicLink}
   */
  private async _sendMagicLinkRequest(
    identifier: ScuteIdentifier,
    method: "register" | "login" = "login",
    userMeta?: UserMeta,
    webauthnEnabled = isWebauthnSupported()
  ) {
    return this.post<ScuteMagicLinkIdResponse>(`/magic_links/${method}`, {
      identifier,
      ...(method === "register" ? { user_meta: userMeta } : null),
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
   * Update user meta for the current user.
   * @param meta {UserMeta}
   */
  async updateUserMeta(meta: UserMeta) {
    const { data, error } = await this.getAuthToken();

    if (error) {
      return { data: null, error };
    }

    return this._updateUserMeta(meta, data.access);
  }

  /**
   * Update user meta.
   * @param meta {UserMeta} - Meta fields
   * @param accessToken - Access Token
   * @see {@link updateUserMeta}
   */
  protected async _updateUserMeta(meta: UserMeta, accessToken: string) {
    return this.patch<{ user: ScuteUserData }>(
      "/current_user/meta",
      {
        user_meta: meta,
      },
      accessTokenHeader(accessToken)
    );
  }

  /**
   * Confirm invite.
   * @param token Magic link token
   * @param userMeta {UserMeta} Meta fields
   */
  async confirmInvite(token: string, userMeta: UserMeta) {
    return this._confirmInvite(token, userMeta);
  }

  /**
   * Confirm invite.
   * @param token Magic link token
   * @param userMeta {UserMeta} Meta fields
   * @see {@link confirmInvite}
   */
  protected async _confirmInvite(token: string, userMeta?: UserMeta) {
    return this.post<ScuteTokenPayload>("/magic_links/confirm_invite", {
      token,
      user_meta: userMeta,
    });
  }

  /**
   * Revoke the specific session of the current user.
   * @param id Session ID
   * @param credentialId (Optional) credentialId
   */
  async revokeSession(
    id: UniqueIdentifier,
    credentialId?: UniqueIdentifier | null
  ) {
    const { data: authData, error } = await this.getAuthToken();

    if (error) {
      return { data: null, error };
    }

    if (!credentialId) {
      const { data } = await this.listUserSessions();
      if (data) {
        const session = data.find((session) => session.id === id);
        if (session?.credential_id) {
          credentialId = session.credential_id;
        }
      }
    }

    if (credentialId) {
      const decodedAccess = decodeAccessToken(authData.access);
      if (decodedAccess?.userId) {
        await this.deleteCredentialId(decodedAccess.userId, credentialId);
      }
    }

    return this._revokeSession(id, authData.access);
  }

  /**
   * Revoke session.
   * @param id Session ID
   * @param accessToken Access Token
   * @see {@link revokeSession}
   */
  protected async _revokeSession(id: UniqueIdentifier, accessToken: string) {
    return this.delete(`/sessions/${id}`, accessTokenHeader(accessToken));
  }

  /**
   * Get all sessions for the authenticated user.
   */
  async listUserSessions() {
    const { data, error } = await this.getAuthToken();

    if (error) {
      return { data: null, error };
    }

    return this._userSessionsRequest(data.access);
  }

  /**
   * Get all user sessions.
   * @param accessToken Access Token
   */
  protected async _userSessionsRequest(accessToken: string) {
    return this.get<ScuteUserSession[]>(
      "/sessions",
      accessTokenHeader(accessToken)
    );
  }

  /**
   * @internal
   * @see {@link refreshSession}
   */
  protected async _refreshRequest(jwt: string) {
    return this.post<ScuteTokenPayload>(
      "/tokens/refresh",
      null,
      refreshTokenHeaders(jwt)
    );
  }

  /**
   * Emit an auth event so it can be listened to with onAuthStateChange.
   * @param event {AuthChangeEvent}
   * @param session {Session}
   * @param user {ScuteUserData}
   * @internal
   * @see {@link onAuthStateChange}
   */
  protected emitAuthChangeEvent(
    event: AuthChangeEvent,
    session?: Session | null,
    user?: ScuteUserData | null
  ) {
    this.emitter.emit(INTERNAL_EVENTS.AUTH_STATE_CHANGED, {
      event,
      session,
      user,
    });
  }
}

/**
 * Create a new ScuteClient.
 * @returns {ScuteClient}
 */
export const createClient = (
  ...params: ConstructorParameters<typeof ScuteClient>
) => new ScuteClient(...params);

export default ScuteClient;
