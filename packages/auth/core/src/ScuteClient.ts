//import { BroadcastChannel } from "broadcast-channel";
import mitt, { type Emitter, type Handler } from "mitt";

import {
  ScuteBaseHttp,
  ScuteSession,
  type AuthChangeEvent,
  AUTH_CHANGE_EVENTS,
  type InternalEvent,
  INTERNAL_EVENTS,
  SCUTE_BROADCAST_CHANNEL,
  SCUTE_MAGIC_PARAM,
  webauthn,
  isBrowser,
} from "./lib";

import type {
  ScuteCallbackTokenResponse,
  ScuteClientConfig,
  ScuteMagicLinkStatusValidResponse,
  ScuteMagicLinkVerifyWaDisabledResponse,
  ScuteMagicLinkVerifyWaEnabledResponse,
  ScuteSendMagicLinkResponse,
  ScuteTokenPayload,
  ScuteWebauthnCredentialsResponse,
  ScuteWebauthnStartResponse,
  Session,
} from "./lib/types";

type TempOptions = {
  webauthn: "strict" | "optional" | "disabled";
};

export class ScuteClient extends ScuteBaseHttp {
  protected appId: ScuteClientConfig["appId"];
  protected appDomain?: ScuteClientConfig["appDomain"];

  protected scuteSession: ScuteSession;

  tempOptions: TempOptions;

  protected emitter: Emitter<InternalEvent>;
  protected channel: BroadcastChannel | null = null;

  protected initializePromise: ReturnType<typeof this._initialize> | null =
    null;

  constructor(config: ScuteClientConfig, tempOptions?: TempOptions) {
    const baseUrl = config.baseUrl || "https://api.scute.io";
    const appId = config.appId;

    // TODO
    super(baseUrl + "/v1/auth/" + appId + "/", {
      credentials: "include",
    });

    this.appId = appId;
    this.appDomain = config.appDomain;

    this.scuteSession = new ScuteSession({
      appId: this.appId,
      appDomain: this.appDomain,
      sessionStore: "cookie",
    });

    this.tempOptions = {
      webauthn: "optional",
      ...tempOptions,
    };

    this.emitter = mitt<InternalEvent>();

    if (isBrowser()) {
      this.channel = new BroadcastChannel(
        SCUTE_BROADCAST_CHANNEL
        //   {
        //   // // TODO: support other than native
        //   // type: "native",
        // }
      );
    }
  }

  /**
   * Initializes the client session (cached)
   */
  initialize() {
    if (!this.initializePromise) {
      // prevent calling initialize multiple times
      this.initializePromise = this._initialize();
    }

    return this.initializePromise;
  }

  /**
   * Initializes the client session
   */
  private async _initialize() {
    if (isBrowser()) {
      this._setupSessionBroadcast();
      return this._getSessionFromUrl();
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
          //@ts-ignore
          ...msg.payload,
          // prevent infinite loop
          _broadcasted: true,
        });
      }
    };
  }

  /**
   * Starts the session from the window.location URL string if available.
   * Only when the webauthn is not available.
   */
  private async _getSessionFromUrl() {
    const url = new URL(window.location.href);

    if (url.searchParams.has(SCUTE_MAGIC_PARAM)) {
      const token = url.searchParams.get(SCUTE_MAGIC_PARAM)!;

      const withRemoveParam = <T>(arg: T) => {
        url.searchParams.delete(SCUTE_MAGIC_PARAM);
        window.history.replaceState(window.history.state, "", url.toString());

        return arg;
      };

      if (!this.isWebauthnAvailable) {
        this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.MAGIC_LOADING);
      }

      const { data, error: verifyError } = await this.verifyMagicLink(
        token,
        false
      );

      if (verifyError) {
        return withRemoveParam({ data: null, error: verifyError });
      }

      const callbackToken = data?.cbt;
      const { data: payload, error: callbackError } = await this.authCallback(
        callbackToken
      );

      if (callbackError) {
        return withRemoveParam({ data: null, error: callbackError });
      }

      if (!this.isWebauthnAvailable) {
        const { error } = await this.loginWithTokenPayload(payload);
        return withRemoveParam({ data: null, error });
      } else {
        const { data, error } = await this.verifyMagicLink(token, true);
        if (error) return withRemoveParam({ data, error });

        if (data.action === "register") {
          this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.BIO_REGISTER);
          return withRemoveParam({
            data: { options: data.options, payload },
            error: null,
          });
        } else {
          // already registered
          this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.BIO_VERIFY);
          const { error } = await this.loginWithVerifyDevice(data.options);
          if (error) {
            this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.MAGIC_LOADING);
            setTimeout(() => {
              this.loginWithTokenPayload(payload);
            }, 300);
          }
          return withRemoveParam({ data: null, error: null });
        }
      }
    }

    return { data: null, error: null };
  }

  async login(email: string) {
    return this.isWebauthnAvailable
      ? this.startWebauthnCeremony(email)
      : this.sendMagicLink(email);
  }

  /**
   * Start webauthn ceremony.
   * Assuming that you've checked the webauthn support.
   */
  async startWebauthnCeremony(email: string) {
    const { data, error } = await this.webauthnStart(email);
    if (error) return { data, error };

    if (data.action === "register") {
      // TODO: api server should handle this?
      return this.sendMagicLink(email);
    } else if (data.action === "login") {
      const { error } = await this.loginWithVerifyDevice(data.options);
      if (error) return this.sendMagicLink(email);

      return { data: null, error: null };
    } else {
      // existing user
      // new device
      // TODO: api server should handle this?
      return this.sendMagicLink(email);
    }
  }

  /**
   * Checks if the webauthn is supported in the browser
   * and disabled within the config.
   */
  public get isWebauthnAvailable(): boolean {
    return (
      isBrowser() &&
      this.tempOptions.webauthn !== "disabled" &&
      webauthn.supported()
    );
  }

  async loginWithMagicToken(token: string) {
    const { data, error } = await this.verifyMagicLink(token, false);
    if (error) return { error };

    const callbackToken = data?.cbt;
    return this.loginWithCallbackToken(callbackToken);
  }

  async signOut(access_token?: string | null) {
    // TODO
    // if (!access_token) {
    //   access_token = (await this.getSession()).data.access;
    // }
    // if (access_token) await this._signOut(access_token);

    this.scuteSession.sync(this.scuteSession.unAuthorizedState());
    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.SIGN_OUT);
    return { error: null };
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
    > = async ({ event }) => {
      const { data: session } = await this._getSession();
      callback(event, session);
    };

    this.emitter.on(INTERNAL_EVENTS.AUTH_STATE_CHANGED, handler);
    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.INITIAL_SESSION);

    return () => this.emitter.off(INTERNAL_EVENTS.AUTH_STATE_CHANGED, handler);
  }

  /**
   * Register the device (create webauthn credentials) and login.
   */
  async loginWithRegisterDevice(
    options: webauthn.CredentialCreationOptionsJSON["publicKey"]
  ) {
    const { data, error } = await this.attemptWebauthnCredentialsCreate({
      publicKey: options,
    });

    if (error) return { error };

    const callbackToken = data!.cbt;
    return this.loginWithCallbackToken(callbackToken);
  }

  /**
   * Verify the device (assert webauthn credentials) and login.
   */
  async loginWithVerifyDevice(
    options: webauthn.CredentialRequestOptionsJSON["publicKey"]
  ) {
    const { data, error } = await this.attemptWebauthnCredentialsAssertion({
      publicKey: options,
    });
    if (error) return { error };

    const callbackToken = data!.cbt;
    return this.loginWithCallbackToken(callbackToken);
  }

  async loginWithMagicLinkId(id: string) {
    const { data, error } = await this.magicLinkStatus(id);
    if (error) return { error };

    const callbackToken = data?.cbt;
    return this.loginWithCallbackToken(callbackToken);
  }

  async getSession() {
    // initialize in case the consumer
    // maybe does not call this in the mount
    await this.initialize();

    return this._getSession();
  }

  private async _getSession() {
    const session = this.scuteSession.initialState();
    const error = null;

    // TODO: auto refresh token (optional)

    if (error) {
      console.error(error);
    }

    return { data: session, error };
  }

  // TODO: visibility change handler

  async setSession(payload?: ScuteTokenPayload | null) {
    if (!payload?.access_token) {
      this.scuteSession.sync(this.scuteSession.unAuthorizedState());
      return { error: null };
    }

    this.scuteSession.sync({
      access: payload.access_token,
      refresh: payload.refresh_token,
      csrf: payload.csrf,
      accessExpiresAt: new Date(payload.access_expires_at),
      refreshExpiresAt: new Date(payload.refresh_expires_at),
      user: JSON.parse(payload.user),
      status: "authenticated",
    });

    return { error: null };
  }

  async getUser(access_token?: string | null) {
    if (!access_token) {
      const { data: session, error } = await this.getSession();

      return { data: session?.user ?? null, error };
    }

    return this.get<any>("profile", this._tokenHeaders(access_token));
  }

  async loginWithTokenPayload(payload: ScuteTokenPayload) {
    const { error } = await this.setSession(payload);
    if (error) return { error };

    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.SIGN_IN);

    return { error: null };
  }

  protected async loginWithCallbackToken(callbackToken: string) {
    const { data: payload, error } = await this.authCallback(callbackToken);
    if (error) return { error };

    return this.loginWithTokenPayload(payload);
  }

  async attemptWebauthnCredentialsCreate(
    options: webauthn.CredentialCreationOptionsJSON
  ) {
    try {
      this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.BIO_REGISTER);

      const credential = await webauthn.create(
        webauthn.parseCreationOptionsFromJSON(options)
      );

      return this.webauthnCredentialsCreate(credential);
    } catch (error) {
      return { data: null, error };
    }
  }

  async attemptWebauthnCredentialsAssertion(
    options: webauthn.CredentialRequestOptionsJSON
  ) {
    try {
      this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.BIO_VERIFY);

      const credential = await webauthn.get(
        webauthn.parseRequestOptionsFromJSON(options)
      );
      return this.webauthnCredentialsAssertion(credential);
    } catch (error) {
      return { data: null, error };
    }
  }

  protected emitAuthChangeEvent(event: AuthChangeEvent) {
    this.emitter.emit(INTERNAL_EVENTS.AUTH_STATE_CHANGED, {
      event,
    });
  }

  async webauthnStart(email: string) {
    return this.post<ScuteWebauthnStartResponse>("webauthn/start", { email });
  }

  async webauthnFail(email: string) {
    return this.post<any>("webauthn/fail", { email });
  }

  async webauthnCredentialsCreate(
    credential: webauthn.RegistrationPublicKeyCredential
  ) {
    return this.post<ScuteWebauthnCredentialsResponse>(
      "webauthn_credentials/create",
      credential
    );
  }

  async webauthnCredentialsAssertion(
    credential: webauthn.AuthenticationPublicKeyCredential
  ) {
    return this.post<ScuteWebauthnCredentialsResponse>(
      "webauthn_credentials/verify",
      credential
    );
  }

  async authCallback(callbackToken: string) {
    return this.post<ScuteCallbackTokenResponse>("auth/callback", {
      callback: callbackToken,
    });
  }

  async profile(jwt?: string | null) {
    return this.get("users/profile", jwt ? this._tokenHeaders(jwt) : undefined);
  }

  private async _signOut(access_token: string) {
    return this.post<any>(
      "users/logout",
      null,
      this._tokenHeaders(access_token)
    );
  }

  async sendMagicLink(email: string) {
    this.emitAuthChangeEvent(AUTH_CHANGE_EVENTS.MAGIC_PENDING);
    return this._sendMagicLink(email);
  }

  async _sendMagicLink(email: string) {
    return this.post<ScuteSendMagicLinkResponse>("magic_links", { email });
  }

  async magicLinkStatus(id: string) {
    return this.post<ScuteMagicLinkStatusValidResponse>("magic_links/status", {
      id,
    });
  }

  async verifyMagicLink<T extends boolean>(token: string, client_wa: T) {
    type ReturnDataType = T extends true
      ? ScuteMagicLinkVerifyWaEnabledResponse
      : T extends false
      ? ScuteMagicLinkVerifyWaDisabledResponse
      :
          | ScuteMagicLinkVerifyWaDisabledResponse
          | ScuteMagicLinkVerifyWaEnabledResponse;

    return this.post<ReturnDataType>("magic_links/register", {
      token,
      client_wa,
    });
  }

  private _tokenHeaders(jwt: string): HeadersInit {
    return {
      "X-Authorization": `Bearer ${jwt}`,
    };
  }

  private _refreshHeaders(refresh: string): HeadersInit {
    return {
      "X-Refresh-Token": refresh,
    };
  }
}

export const createClient = (
  ...params: ConstructorParameters<typeof ScuteClient>
) => new ScuteClient(...params);
