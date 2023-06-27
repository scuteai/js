import {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@github/webauthn-json/dist/types/basic/json";
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
  SCUTE_MAGIC_PARAM,
  webauthn,
  isBrowser,
  identifyAuthenticationError,
  identifyRegistrationError,
  isWebauthnSupported,
  ScuteError,
} from "./lib";

import type {
  ScuteClientConfig,
  ScuteMagicLinkStatusValidResponse,
  ScuteMagicLinkVerifyWaDisabledResponse,
  ScuteMagicLinkVerifyWaEnabledResponse,
  ScuteSendMagicLinkResponse,
  ScuteTokenPayload,
  ScuteTokenPayloadUser,
  ScuteWebauthnCredentialsResponse,
  ScuteWebauthnStartResponse,
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

  protected readonly emitter: Emitter<InternalEvent>;
  protected readonly channel: BroadcastChannel | null = null;
  protected initializePromise: ReturnType<typeof this._initialize> | null =
    null;

  constructor(config: ScuteClientConfig) {
    const baseUrl = config.baseUrl || "https://api.scute.io";
    const appId = config.appId;

    const endpointPrefix = `/v1/auth/${appId}`;
    super(`${baseUrl}${endpointPrefix}`, {
      credentials: "include",
    });

    this.appId = appId;

    this.persistSession = config.preferences?.persistSession !== false;
    this.autoRefreshToken = config.preferences?.autoRefreshToken !== false;

    this.scuteSession = new ScuteSession({
      appId: this.appId,
      storage: this.persistSession
        ? config.preferences?.sessionStorageAdapter ??
          (typeof window === "undefined"
            ? ScuteNoneStorage
            : (window.localStorage as any))
        : ScuteNoneStorage,
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
   * Initializes the client session (cached).
   */
  initialize() {
    if (!this.initializePromise) {
      // cache
      this.initializePromise = this._initialize();
    }

    return this.initializePromise;
  }

  /**
   * Initializes the client session.
   */
  private async _initialize() {
    if (isBrowser()) {
      if (this.persistSession) {
        this._setupSessionBroadcast();
      }
      return this._getSessionFromUrl();
      // const { data, error } = await this._getSessionFromUrl();
      // if (error) return { data, error };

      // return {
      //   data: {
      //     urlSessionData: data,
      //   },
      //   error,
      // };
    }

    return { data: null, error: null };
  }

  /**
   * Initializes broadcast channel for other tabs listening.
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
   * Starts the session from the window.location URL string if available.
   */
  private async _getSessionFromUrl() {
    const url = new URL(window.location.href);

    if (url.searchParams.has(SCUTE_MAGIC_PARAM)) {
      const token = url.searchParams.get(SCUTE_MAGIC_PARAM)!;
      const isWebauthnEnabledToken = true; // TODO
      const isWebauthnAvailable =
        isWebauthnSupported() && isWebauthnEnabledToken;

      const withRemoveParam = <T>(arg: T) => {
        url.searchParams.delete(SCUTE_MAGIC_PARAM);
        window.history.replaceState(window.history.state, "", url.toString());

        return arg;
      };

      if (!isWebauthnAvailable) {
        this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.MAGIC_LOADING);
      }

      const { data, error: verifyError } = await this.verifyMagicLinkToken(
        token,
        false
      );

      if (verifyError) {
        return withRemoveParam({ data: null, error: verifyError });
      }

      const callbackToken = data.cbt;
      const { data: payload, error: callbackError } = await this.authCallback(
        callbackToken
      );

      if (callbackError) {
        return withRemoveParam({ data: null, error: callbackError });
      }

      if (!isWebauthnAvailable) {
        const { error } = await this.signInWithTokenPayload(payload);
        return withRemoveParam({ data: null, error });
      } else {
        const { data, error } = await this.verifyMagicLinkToken(token, true);
        if (error) return withRemoveParam({ data, error });

        if (data.action === "register") {
          this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.BIO_REGISTER);
          return withRemoveParam({
            data: { options: data.options, payload },
            error: null,
          });
        } else if (data.action === "login") {
          // already registered
          this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.MAGIC_LOADING);
          setTimeout(() => {
            // smooth loading
            this.signInWithTokenPayload(payload);
          }, 300);
          return withRemoveParam({ data: null, error: null });
        } else {
          // unknown state
          // login anyway
          const { error } = await this.signInWithTokenPayload(payload);
          return withRemoveParam({ data: null, error });
        }
      }
    }

    return { data: null, error: null };
  }

  async getRememberedUser() {
    return this.scuteSession.getRememberedUser();
  }

  /**
   * Receive a notification every time an auth event happens.
   * @param callback A callback function to be invoked when an auth event happens.
   */
  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session) => void
  ) {
    const handler: Handler<
      InternalEvent[typeof INTERNAL_EVENTS.AUTH_STATE_CHANGED]
    > = async ({ event, session }) => {
      if (!session) {
        ({ data: session } = await this._getSession());
      }
      callback(event, session);
    };

    this.emitter.on(INTERNAL_EVENTS.AUTH_STATE_CHANGED, handler);
    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.INITIAL_SESSION);

    return () => this.emitter.off(INTERNAL_EVENTS.AUTH_STATE_CHANGED, handler);
  }

  async signInWithEmail(
    email: string,
    webauthn: "strict" | "optional" | "disabled" = "optional"
  ) {
    if (webauthn !== "disabled" && isWebauthnSupported()) {
      const { data, error: webauthnLoginError } = await this._webauthnLogin(
        email
      );
      if (webauthnLoginError) {
        if (webauthnLoginError.message === "New Device") {
          // TODO: temp
          this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.MAGIC_NEW_DEVICE_PENDING);
          return this._sendMagicLink(email);
        }
        return { data, error: webauthnLoginError };
      }

      const { error } = await this.signInWithVerifyDevice(data.options);
      return { data: null, error };
    }

    return this.sendMagicLink(email);
  }

  async signUpWithEmail(email: string) {
    return this.sendMagicLink(email);
  }

  /**
   * Login with magic link token
   * @param token Magic link token (sct_magic)
   * @returns
   */
  async signInWithMagicLinkToken(token: string) {
    const { data, error } = await this.verifyMagicLinkToken(token, false);
    if (error) return { error };

    const callbackToken = data.cbt;
    return this.signInWithCallbackToken(callbackToken);
  }

  /**
   * Register the device (create webauthn credentials) and login.
   */
  async signInWithRegisterDevice(
    options: NonNullable<webauthn.CredentialCreationOptionsJSON["publicKey"]>
  ) {
    const { data, error } = await this.attemptWebauthnCredentialsCreate({
      publicKey: options,
    });

    if (error) return { error };

    const callbackToken = data.cbt;
    return this.signInWithCallbackToken(callbackToken);
  }

  /**
   * Verify the device (assert webauthn credentials) and login.
   */
  async signInWithVerifyDevice(
    options: NonNullable<webauthn.CredentialRequestOptionsJSON["publicKey"]>
  ) {
    const { data, error } = await this.attemptWebauthnCredentialsAssertion({
      publicKey: options,
    });
    if (error) return { error };

    const callbackToken = data.cbt;
    return this.signInWithCallbackToken(callbackToken);
  }

  /**
   * Login with magic link status id if consumed.
   * @param id Magic link status id
   * @returns
   */
  async signInWithMagicLinkId(id: UniqueIdentifier) {
    const { data, error } = await this.getMagicLinkStatus(id);
    if (error) return { error };

    const callbackToken = data.cbt;
    return this.signInWithCallbackToken(callbackToken);
  }

  async signInWithTokenPayload(payload: ScuteTokenPayload) {
    const { data: session, error } = await this.setSession(payload);
    if (error) return { error };

    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.SIGN_IN, session);
    return { error: null };
  }

  protected async signInWithCallbackToken(callbackToken: string) {
    const { data: payload, error } = await this.authCallback(callbackToken);
    if (error) return { error };

    return this.signInWithTokenPayload(payload);
  }

  /**
   * Sign out
   */
  async signOut() {
    const {
      data: { access: accessToken },
      error,
    } = await this.getSession();

    if (error) {
      return { error };
    }

    if (accessToken) await this.admin.signOut(accessToken);
    await this.scuteSession.removeSession();
    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.SIGN_OUT);
    return { error: null };
  }

  async getSession() {
    // initialize double-check
    await this.initialize();

    return this._getSession();
  }

  private async _getSession() {
    let error: ScuteError | null = null;
    let session = await this.scuteSession.initialState();

    if (this.autoRefreshToken) {
      ({ data: session, error } = await this._maybeRefreshSilently(session));
    }

    return { data: session, error };
  }

  private async _maybeRefreshSilently(session: Session) {
    let error: ScuteError | null = null;

    if (
      session.refresh &&
      session.csrf &&
      session.accessExpiresAt !== null &&
      new Date() >= session.accessExpiresAt
    ) {
      const { data, error: refreshError } = await this.refresh(
        session.refresh,
        session.csrf
      );
      if (refreshError) {
        // signOut on error
        await this.signOut();
        session = ScuteSession.unAuthenticatedState();
      } else {
        ({ data: session, error } = await this.setSession(data));

        if (!error) {
          this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.TOKEN_REFRESH);
        }
      }
    }

    return { data: session, error };
  }

  async setSession(payload: ScuteTokenPayload | null) {
    if (!payload || !payload.access_token || !payload.refresh_token) {
      this.scuteSession.removeSession();
      return { data: ScuteSession.unAuthenticatedState(), error: null };
    }

    const session: Session = {
      access: payload.access_token,
      refresh: payload.refresh_token,
      csrf: payload.csrf,
      accessExpiresAt: new Date(payload.access_expires_at),
      refreshExpiresAt: new Date(payload.refresh_expires_at),
      user: JSON.parse(payload.user) as ScuteTokenPayloadUser,
      status: "authenticated",
    };

    this.scuteSession.sync(session);

    return { data: session, error: null };
  }

  /**
   * Get the user by current session or by accessToken.
   * @param accessToken JWT access_token
   */
  async getUser(accessToken?: string) {
    if (!accessToken) {
      const { data: session, error } = await this.getSession();
      return { data: session?.user ?? null, error };
    }

    return this._profile(accessToken);
  }

  async attemptWebauthnCredentialsCreate(
    options: webauthn.CredentialCreationOptionsJSON
  ) {
    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.BIO_REGISTER);
    try {
      const credential = await webauthn.create(options);

      return this.webauthnCredentialsCreate(credential);
    } catch (error) {
      return {
        data: null,
        error: identifyRegistrationError({
          error: error as any,
          options: options as any,
        }),
      };
    }
  }

  async attemptWebauthnCredentialsAssertion(
    options: webauthn.CredentialRequestOptionsJSON
  ) {
    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.BIO_VERIFY);

    try {
      const credential = await webauthn.get(options);

      return this.webauthnCredentialsAssertion(credential);
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

  // TODO
  private async _webauthnStart(email: string) {
    return this.post<ScuteWebauthnStartResponse>("/webauthn/start", { email });
  }

  // TODO
  private async _webauthnLogin(email: string) {
    const { data, error } = await this._webauthnStart(email);

    if (error) {
      return { data, error };
    }

    if (data.action === "register") {
      return {
        data: null,
        error: new ScuteError({ message: "User does not exist" }),
      };
    } else if (data.action !== "login") {
      return {
        data: null,
        error: new ScuteError({ message: "New Device" }),
      };
    }

    return { data, error };
  }

  async webauthnFail(email: string) {
    return this.post<any>("/webauthn/fail", { email });
  }

  async webauthnCredentialsCreate(
    credential: webauthn.PublicKeyCredentialWithAttestationJSON
  ) {
    return this.post<ScuteWebauthnCredentialsResponse>(
      "/webauthn_credentials/create",
      credential
    );
  }

  async webauthnCredentialsAssertion(
    credential: webauthn.PublicKeyCredentialWithAssertionJSON
  ) {
    return this.post<ScuteWebauthnCredentialsResponse>(
      "/webauthn_credentials/verify",
      credential
    );
  }

  protected async authCallback(callbackToken: string) {
    return this.post<ScuteTokenPayload>("/auth/callback", {
      callback: callbackToken,
    });
  }

  /**
   * Get user profile
   */
  async profile(jwt?: string) {
    if (!jwt) {
      const { data: session, error } = await this.getSession();
      jwt = session.access ?? undefined;
    }

    return this._profile(jwt);
  }

  protected async _profile(jwt?: string) {
    return this.get<any>("/profile", this._accessTokenHeader(jwt));
  }

  /**
   * Send magic link request and emit the pending event.
   */
  async sendMagicLink(email: string) {
    const { data, error } = await this._sendMagicLink(email);

    if (!error) {
      this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.MAGIC_PENDING);
    }
    return { data, error };
  }

  /**
   * Send magic link request.
   */
  protected async _sendMagicLink(email: string) {
    return this.post<ScuteSendMagicLinkResponse>("/magic_links", { email });
  }

  /**
   * Get access token if the magic link consumed.
   * @param id Magic link status id
   */
  async getMagicLinkStatus(id: UniqueIdentifier) {
    return this.post<ScuteMagicLinkStatusValidResponse>("/magic_links/status", {
      id,
    });
  }

  /**
   * Verify magic link token
   * @param token Magic link token (sct_magic)
   * @param client_wa Webauthn client support boolean
   */
  async verifyMagicLinkToken<T extends boolean>(token: string, client_wa: T) {
    type ReturnDataType = T extends true
      ? ScuteMagicLinkVerifyWaEnabledResponse
      : T extends false
      ? ScuteMagicLinkVerifyWaDisabledResponse
      :
          | ScuteMagicLinkVerifyWaDisabledResponse
          | ScuteMagicLinkVerifyWaEnabledResponse;

    return this.post<ReturnDataType>("/magic_links/register", {
      token,
      client_wa,
    });
  }

  async refresh(jwt: string, csrf: string) {
    return this.post<ScuteTokenPayload>(
      "/auth/refresh",
      null,
      this._refreshTokenHeaders(jwt, csrf)
    );
  }

  protected emitAuthChangeEvent(event: AuthChangeEvent, session?: Session) {
    this.emitter.emit(INTERNAL_EVENTS.AUTH_STATE_CHANGED, {
      event,
      session,
    });
  }

  private _accessTokenHeader(jwt?: string): HeadersInit {
    if (!jwt) return {};

    return {
      "X-Authorization": `Bearer ${jwt}`,
    };
  }

  private _refreshTokenHeaders(jwt?: string, csrf?: string): HeadersInit {
    if (!jwt || !csrf) return {};

    return {
      "X-Refresh-Token": jwt,
      "X-CSRF-Token": csrf,
    };
  }
}

export const createClient = (
  ...params: ConstructorParameters<typeof ScuteClient>
) => new ScuteClient(...params);
