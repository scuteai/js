//ScuteClient

// only provides tokenless access to the api
// just for login elements

// and one more function to get access_tokens profile and detailed profile only

// ScuteSession

// set the http-only cookies (refresh, refresh expires at)
// set not-secure tokens -> access, access_expires, user, csrf
// removes tokens on logout

// SSR Helper

// get cookies (secure and not secure)
//

// Node sdk -> needs secret + access + refresh

//

import axios from "axios";
axios.defaults.withCredentials = true;

export type ScuteClientConfig = {
  appId: string;
  baseUrl?: string;
};

export class ScuteClient {
  private appId: string;
  private baseUrl?: string;

  /**
   * Initialize a new Scute Client instance.
   * @param {ScuteClientConfig} config The default config for Scute initialization
   */
  constructor(config: ScuteClientConfig) {
    this.appId = config.appId;
    this.baseUrl = config.baseUrl || "https://api.scute.io";
  }

  /**
   * Returns api url with app id and base url
   * @param {string} endpoint endpoint after /auth/appId/..
   */
  apiUrl(endpoint: string) {
    return this.baseUrl + "/v1/auth/" + this.appId + "/" + endpoint;
  }

  getAppId(): any {
    return this.appId;
  }

  async profile(jwt?: string | null) {
    return this.get("users/profile", jwt);
  }

  async sendMagicLink(_email: string, wa: boolean) {
    let email = _email.toLowerCase();
    return this.post("magic_links", { email, wa }, null);
  }

  async authMagic(token: string, client_wa: boolean) {
    return this.post("magic_links/register", { token, client_wa }, null);
  }

  async magicLinkStatus(id: string) {
    return this._post("magic_links/status", { id }, null);
  }

  async refresh(refreshToken: string, csrf: string) {
    return axios.post(
      this.apiUrl("auth/refresh"),
      { csrf },
      this.refreshHeaders(refreshToken)
    );
  }

  async signInWithCallback(callbackToken: string) {
    return this.post("auth/callback", { callback: callbackToken }, null);
  }

  async login(email: string) {
    return this.post("webauthn/start", { email }, null);
  }

  async fail(email: string) {
    return this.post("webauthn/fail", { email }, null);
  }

  async webauthnCredentialsCreate(makeCredResponse: any) {
    return this.post("webauthn_credentials/create", makeCredResponse, null);
  }
  async webauthnCredentialsAssertion(assertionResponse: any) {
    return this.post("webauthn_credentials/verify", assertionResponse, null);
  }

  async post(endpoint: string, body: any, jwt?: string | null) {
    return axios
      .post(this.apiUrl(endpoint), body, this.tokenHeaders(jwt))
      .then((response) => {
        if (response.status !== 200)
          throw new Error(`Server responed with error. The message is:`);
        return response.data;
      });
  }

  async _post(endpoint: string, body: any, jwt?: string | null) {
    return axios.post(this.apiUrl(endpoint), body, this.headers());
  }

  async get(endpoint: string, jwt?: string | null) {
    return axios
      .get(this.apiUrl(endpoint), this.tokenHeaders(jwt))
      .then((response) => {
        if (response.status !== 200)
          throw new Error(`Server responed with error. The message is:`);
        return response.data;
      });
  }

  tokenHeaders(jwt?: string | null) {
    if (jwt) {
      return this.headers({
        "X-Authorization": "Bearer " + jwt,
      });
    } else {
      return this.headers();
    }
  }

  refreshHeaders(refresh?: string) {
    return this.headers({
      "X-Refresh-Token": refresh,
    });
  }

  headers(_headers?: any) {
    let h = {
      "Content-Type": "application/json",
      Accept: "application/json",
      headers: {},
    };
    const headers = _headers ? _headers : {};
    return {
      ...h,
      headers,
    };
  }
}
