import { ScuteBaseHttp } from "./lib/ScuteBaseHttp";
import { accessTokenHeader, refreshTokenHeaders } from "./lib/helpers";

import type {
  ScuteAppData,
  ScuteIdentifier,
  ScutePaginationMeta,
  ScuteUser,
  ScuteUserData,
  ScuteUserSession,
} from "./lib/types/scute";
import type { ScuteAdminApiConfig } from "./lib/types/config";
import type { UniqueIdentifier } from "./lib/types/general";

class ScuteAdminApi extends ScuteBaseHttp {
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
   * Get app config data.
   */
  async getAppData() {
    return this.get<ScuteAppData>(`${this._appsPath}`);
  }

  /**
   * Get a list of users.
   */
  async listUsers(params?: any) {
    // {
    //   limit: "3",
    //   page: "1",
    //   //identifier: ""
    //   //order_by: ""
    //   //created_before
    //   //status
    //   //email_verified
    //   //id
    //   //last_login_at
    //   //login_count
    // };

    const { data, error } = await this.get<
      {
        users: ScuteUserData[];
      } & ScutePaginationMeta
    >(
      `${this._v1Path}/users` +
        (params ? `?${new URLSearchParams(params)}` : ""),
      {
        ...this._authorizationHeader,
      }
    );

    if (error) {
      return { data: null, error };
    }

    const { users, ...pagination } = data;

    return {
      data: {
        users,
        pagination,
      },
      error: null,
    };
  }

  /**
   * Get a user's information (including any defined user metadata).
   * @param id User ID
   */
  async getUser(id: string) {
    return this.get<{ user: ScuteUserData | null }>(
      `${this._v1Path}/users/${id}`,
      {
        ...this._authorizationHeader,
      }
    );
  }

  /**
   * Get user's basic information by identifier.
   * * Unauthenticated
   * @param identifier {ScuteIdentifier}
   */
  async getUserByIdentifier(identifier: ScuteIdentifier) {
    return this.get<{ user: ScuteUser | null }>(
      `${this._authPath}/users?identifier=${identifier}`
    );
  }

  /**
   * Get user's basic information by user id.
   * * Unauthenticated
   * @param userId {UniqueIdentifier}
   */
  async getUserByUserId(userId: UniqueIdentifier) {
    return this.get<{ user: ScuteUser | null }>(
      `${this._authPath}/users?user_id=${userId}`
    );
  }

  /**
   * Create a user (with optional user metadata).
   * * Unauthenticated
   * @param identifier {ScuteIdentifier}
   * @param meta - User meta
   */
  async createUser(
    identifier: string,
    meta?: Record<string, boolean | string | number>
  ) {
    return this.post<{ user: ScuteUser }>(`${this._authPath}/users`, {
      identifier,
      user_meta: meta,
    });
  }

  /**
   * Update a user's information (email address or phone number).
   * @param id User ID
   * @param data any
   */
  async updateUser(id: string, data: any) {
    return this.patch<{ user: ScuteUserData }>(
      `${this._v1Path}/users/${id}`,
      data,
      {
        ...this._authorizationHeader,
      }
    );
  }

  /**
   * Activate a user.
   * @param id User ID
   */
  async activateUser(id: string) {
    return this.post<{ user: ScuteUserData }>(
      `${this._v1Path}/users/${id}/activate`,
      null,
      {
        ...this._authorizationHeader,
      }
    );
  }

  /**
   * Deactivate a user (a deactivated user will not be able to log in).
   * @param id User ID
   */
  async deactivateUser(id: string) {
    return this.post<{ user: ScuteUserData }>(
      `${this._v1Path}/users/${id}/deactivate`,
      null,
      {
        ...this._authorizationHeader,
      }
    );
  }

  /**
   * Delete a user.
   * @param id User ID
   */
  async deleteUser(id: string) {
    return this.delete(`${this._v1Path}/users/${id}`, {
      ...this._authorizationHeader,
    });
  }

  /**
   * Sign out
   * @param accessToken JWT access_token
   */
  async signOut(accessToken: string) {
    return this.delete(`${this._authPath}/current_user`, {
      ...accessTokenHeader(accessToken),
    });
  }

  /**
   * Refresh
   * @param refreshToken JWT refresh_token
   */
  async refresh(refreshToken: string) {
    return this.post<any>(`${this._authPath}/tokens/refresh`, null, {
      ...refreshTokenHeaders(refreshToken),
    });
  }

  /**
   * Refresh with access_token
   * @param accessToken JWT access_token
   */
  async refreshWithAccess(accessToken: string) {
    return this.post<any>(`${this._authPath}/tokens/rotate_access`, null, {
      ...accessTokenHeader(accessToken),
      ...this._authorizationHeader,
    });
  }

  /**
   * Generates new access_token with refresh_token
   * @param refreshToken JWT refresh_token
   */
  async forceRefresh(refreshToken: string) {
    return this.post<any>(`${this._authPath}/tokens/force_refresh`, null, {
      ...refreshTokenHeaders(refreshToken),
      ...this._authorizationHeader,
    });
  }

  /**
   * List all sessions for a user.
   * @param id User ID
   */
  async listUserSessions(id: string) {
    return this.get<ScuteUserSession[]>(
      `${this._appsPath}/users/${id}/sessions`,
      {
        ...this._authorizationHeader,
      }
    );
  }

  /**
   * Revoke a particular session from a user.
   * @param userId User ID
   * @param sessionId Session ID
   */
  async revokeUserSession(userId: string, sessionId: string) {
    return this.delete(
      `${this._v1Path}/users/${userId}/sessions/${sessionId}`,
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

  private get _v1Path() {
    return `/v1/${this.appId}` as const;
  }

  private get _appsPath() {
    return `/v1/apps/${this.appId}` as const;
  }

  private get _authPath() {
    return `/v1/auth/${this.appId}` as const;
  }
}

export default ScuteAdminApi;
