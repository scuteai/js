import { ScuteBaseHttp } from "./lib";
import type { UniqueIdentifier, ScuteAdminApiConfig } from "./lib/types";

export class ScuteAdminApi extends ScuteBaseHttp {
  protected appId: UniqueIdentifier;
  protected secretKey?: string;

  constructor(config: ScuteAdminApiConfig) {
    const baseUrl = config.baseUrl || "https://api.scute.io";
    const appId = config.appId;
    const secretKey = config.secretKey;

    super(baseUrl, {
      credentials: "include",
    });

    this.appId = appId;

    if (secretKey) {
      this.setSecretKey(secretKey);
    }

    // set default headers
    this.wretcher = this.wretcher.headers({ ...this._authorizationHeader });
  }

  /**
   * Set secret key for admin (management) API.
   * @param secretKey Secret Key
   */
  async setSecretKey(secretKey: string) {
    if (typeof window !== "undefined" && secretKey) {
      console.warn(
        "[Scute] DANGER! You are setting API Secret Key likely in the browser. This is extremely dangerous for production."
      );
    }

    this.secretKey = secretKey;
  }

  /**
   * Get a user's information (including any defined user metadata).
   * @param id User ID
   */
  async getUser(id: string) {
    return this.get<any>(`${this._appsPath}/users/${id}`, {
      ...this._authorizationHeader,
    });
  }

  /**
   * Create a user (with optional user metadata).
   * @param attributes any
   */
  async createUser(attributes: any) {
    return this.post(`${this._appsPath}/users`, attributes, {
      ...this._authorizationHeader,
    });
  }

  /**
   * Activate or deactivate a user (a deactivated user will not be able to log in).
   * @param id User ID
   */
  async activateUser(id: string) {
    return this.post<any>(`${this._appsPath}/users/${id}/activate`, null, {
      ...this._authorizationHeader,
    });
  }

  /**
   * Update a user's information (email address or phone number).
   * @param id User ID
   * @param data any
   */
  async updateUser(id: string, data: any) {
    // or patch
    return this.put<any>(`${this._appsPath}/users/${id}`, data, {
      ...this._authorizationHeader,
    });
  }

  /**
   * Delete a user.
   * @param id User ID
   */
  async deleteUser(id: string) {
    return this.post<any>(`${this._appsPath}/users/${id}/delete`, null, {
      ...this._authorizationHeader,
    });
  }

  /**
   * Sign out
   * @param accessToken JWT access_token
   */
  async signOut(accessToken: string) {
    return this.delete(`${this._authPath}/current_user`, {
      ...this._accessTokenHeader(accessToken),
    });
  }

  /**
   * List all devices for a user.
   * @param id User ID
   */
  async listUserDevices(id: string) {
    return this.get<any>(`${this._appsPath}/users/${id}/devices`, {
      ...this._authorizationHeader,
    });
  }

  /**
   * Revoke a particular device from a user.
   * @param userId User ID
   * @param deviceId Device ID
   */
  async revokeUserDevice(userId: string, deviceId: string) {
    return this.get<any>(
      `${this._appsPath}/users/${userId}/devices/${deviceId}/revoke`,
      {
        ...this._authorizationHeader,
      }
    );
  }

  /**
   * Get authorization header for admin (management) API.
   * @private
   */
  private get _authorizationHeader(): HeadersInit {
    if (!this.secretKey) return {};

    return {
      Authorization: `Bearer ${this.secretKey}`,
    };
  }

  /**
   * Set current_user by jwt access_token.
   * @param jwt access_token
   */
  private _accessTokenHeader(jwt?: string): HeadersInit {
    if (!jwt) return {};

    return {
      "X-Authorization": `Bearer ${jwt}`,
    };
  }

  private get _appsPath() {
    return `/v1/apps/${this.appId}`;
  }

  private get _authPath() {
    return `/v1/auth/${this.appId}`;
  }
}
