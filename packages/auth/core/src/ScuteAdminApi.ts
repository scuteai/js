import { ScuteBaseHttp } from "./lib/ScuteBaseHttp";
import { accessTokenHeader, refreshTokenHeaders } from "./lib/helpers";

import type {
  ListUsersRequestParams,
  ScuteAppData,
  ScuteIdentifier,
  ScutePaginationMeta,
  ScuteSsoDiscovery,
  ScuteUser,
  ScuteUserData,
  ScuteUserSession,
  UserMeta,
} from "./lib/types/scute";
import type { ScuteAdminApiConfig } from "./lib/types/config";
import type { UniqueIdentifier } from "./lib/types/general";
import type {
  AuthzAccessRequest,
  AuthzAccessRequestInput,
  AuthzCheck,
  AuthzDecision,
  AuthzPermissions,
} from "./ScuteAuthzApi";
import type { AuthzFilter } from "./lib/authzFilter";

class ScuteAdminApi extends ScuteBaseHttp {
  protected appId: UniqueIdentifier;
  protected secretKey?: string;

  constructor(config: ScuteAdminApiConfig) {
    const baseUrl = config.baseUrl || "https://api.scute.io";
    const appId = config.appId;
    const secretKey = config.secretKey;
    const errorReporting = config.errorReporting;

    super(errorReporting, baseUrl, {
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
  async listUsers(params?: ListUsersRequestParams) {
    const { data, error } = await this.get<
      {
        users: ScuteUserData[];
      } & ScutePaginationMeta
    >(
      `${this._v1Path}/users` +
        (params
          ? `?${new URLSearchParams(params as Record<string, any>)}`
          : ""),
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
  async getUser(id: UniqueIdentifier) {
    return this.get<{ user: ScuteUserData | null }>(
      `${this._v1Path}/users/${encodeURIComponent(id)}`,
      this._authorizationHeader
    );
  }

  /**
   * Get user's basic information by identifier.
   * * Unauthenticated
   * @param identifier {ScuteIdentifier}
   */
  async getUserByIdentifier(identifier: ScuteIdentifier) {
    return this.get<{ user: ScuteUser | null }>(
      `${this._authPath}/users?identifier=${encodeURIComponent(identifier)}`
    );
  }

  /**
   * Get user's basic information by user id.
   * * Unauthenticated
   * @param userId {UniqueIdentifier}
   */
  async getUserByUserId(userId: UniqueIdentifier) {
    return this.get<{ user: ScuteUser | null }>(
      `${this._authPath}/users?user_id=${encodeURIComponent(userId)}`
    );
  }

  /**
   * Home-realm discovery for a SAML SSO email domain. The endpoint is not
   * app-scoped: it resolves the email's domain to its workspace SAML config,
   * so it lives at /v1/auth/saml/discover (not under an app id).
   * * Unauthenticated
   * @param email {string}
   */
  async discoverSSO(email: string) {
    return this.get<ScuteSsoDiscovery>(
      `/v1/auth/saml/discover?email=${encodeURIComponent(email)}`
    );
  }

  /**
   * Create a user (with optional user metadata).
   * @param identifier {ScuteIdentifier}
   * @param meta {UserMeta} - User meta
   */
  async createUser(identifier: ScuteIdentifier, meta?: UserMeta) {
    return this.post<{ user: ScuteUser }>(
      `${this._authPath}/users`,
      {
        identifier,
        user_meta: meta,
      },
      this._authorizationHeader
    );
  }

  /**
   * Update a user's information (email address or phone number).
   * @param id User ID
   * @param data any
   */
  async updateUser(id: UniqueIdentifier, data: any) {
    return this.patch<{ user: ScuteUserData }>(
      `${this._v1Path}/users/${encodeURIComponent(id)}`,
      data,
      this._authorizationHeader
    );
  }

  /**
   * Activate a user.
   * @param id User ID
   */
  async activateUser(id: UniqueIdentifier) {
    return this.post<{ user: ScuteUserData }>(
      `${this._v1Path}/users/${encodeURIComponent(id)}/activate`,
      null,
      this._authorizationHeader
    );
  }

  /**
   * Deactivate a user (a deactivated user will not be able to log in).
   * @param id User ID
   */
  async deactivateUser(id: UniqueIdentifier) {
    return this.post<{ user: ScuteUserData }>(
      `${this._v1Path}/users/${encodeURIComponent(id)}/deactivate`,
      null,
      this._authorizationHeader
    );
  }

  /**
   * Create a user with pending status and send invitation. (a pending user will not be able to log in).
   *
   * @param identifier {ScuteIdentifier}
   * @param meta {UserMeta} - User meta
   */
  async inviteUser(identifier: ScuteIdentifier, meta?: UserMeta) {
    // TODO: user meta errors
    return this.post<{ user: ScuteUserData; user_meta_errors?: any }>(
      `${this._v1Path}/users/invite`,
      {
        identifier,
        user_meta: meta,
      },
      this._authorizationHeader
    );
  }

  /**
   * Delete a user.
   * @param id User ID
   */
  async deleteUser(id: UniqueIdentifier) {
    return this.delete(`${this._v1Path}/users/${encodeURIComponent(id)}`, {
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
  async listUserSessions(id: UniqueIdentifier) {
    return this.get<ScuteUserSession[]>(
      `${this._appsPath}/users/${encodeURIComponent(id)}/sessions`,
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
  async revokeUserSession(
    userId: UniqueIdentifier,
    sessionId: UniqueIdentifier
  ) {
    return this.delete(
      `${this._v1Path}/users/${encodeURIComponent(
        userId
      )}/sessions/${encodeURIComponent(sessionId)}`,
      {
        ...this._authorizationHeader,
      }
    );
  }

  // ── Authorization (server side) ──
  //
  // "May this user do this?" from your backend. The browser can ask about
  // itself (scute.authz.can); the decision that guards a real action belongs
  // here, and this is where a step-up verification is redeemed.

  /**
   * Check one permission. Pass `challenge` (a completed step-up challenge's
   * token) to satisfy `allow_with_step_up`, and `approval` (an approved
   * request's id) to satisfy `allow_with_approval`. An approval is spent
   * when the answer is `allow`.
   */
  async authzCheck(params: AuthzCheck & { userId: UniqueIdentifier; challenge?: string; approval?: UniqueIdentifier }) {
    const { userId, ...rest } = params;
    return this.post<AuthzDecision>(
      `${this._authPath}/authz/check`,
      { user_id: userId, ...rest },
      this._authorizationHeader
    );
  }

  /** Up to 100 checks, for any users of the app, in one call. */
  async authzCheckBatch(
    checks: (AuthzCheck & { userId: UniqueIdentifier; challenge?: string; approval?: UniqueIdentifier })[]
  ) {
    const { data, error } = await this.post<{ results: AuthzDecision[] }>(
      `${this._authPath}/authz/check-batch`,
      { checks: checks.map(({ userId, ...rest }) => ({ user_id: userId, ...rest })) },
      this._authorizationHeader
    );
    return error ? { data: null, error } : { data: data.results, error: null };
  }

  /** Roles and permissions a user holds, app-wide or on one object ("document:42"). */
  async authzUserPermissions(userId: UniqueIdentifier, options: { resource?: string } = {}) {
    const query = options.resource ? `?resource=${encodeURIComponent(options.resource)}` : "";
    return this.get<AuthzPermissions>(
      `${this._authPath}/authz/users/${encodeURIComponent(userId)}/permissions${query}`,
      this._authorizationHeader
    );
  }

  /** Who may do this (paged). `everyone` is true when a default role grants it. */
  async authzAuthorizedUsers(params: { action: string; resource?: string; limit?: number; offset?: number }) {
    const query = new URLSearchParams({ action: params.action });
    if (params.resource) query.set("resource", params.resource);
    if (params.limit) query.set("limit", String(params.limit));
    if (params.offset) query.set("offset", String(params.offset));
    return this.get<{
      permission: string;
      everyone: boolean;
      total: number;
      users: { id: UniqueIdentifier; email?: string; phone?: string }[];
      resource?: string;
      conditions?: { role: string; when: string }[];
    }>(`${this._authPath}/authz/authorized-users?${query}`, this._authorizationHeader);
  }

  /**
   * A data filter for lists: "all", "none" or a condition over your own
   * fields. Turn it into a query with toPrismaWhere or toSqlWhere.
   */
  async authzFilter(params: {
    userId: UniqueIdentifier;
    action: string;
    resourceType: string;
    context?: Record<string, unknown>;
  }) {
    return this.post<{ permission: string; filter: AuthzFilter; step_up?: boolean; truncated?: boolean }>(
      `${this._authPath}/authz/filter`,
      { user_id: params.userId, action: params.action, resource_type: params.resourceType, context: params.context },
      this._authorizationHeader
    );
  }

  /**
   * Start the verification a step-up permission asks for: a challenge for
   * the user, bound to the permission. When the user has completed it, call
   * authzCheck again with `challenge: <token>`.
   *
   * `method` defaults to the one the decision asks for; pass one when the
   * decision allows any (e.g. "entra_push", "email_otp", "sms_otp").
   */
  async authzStartStepUp(params: {
    userId: UniqueIdentifier;
    decision?: AuthzDecision;
    permission?: string;
    method?: string;
  }) {
    const permission = params.permission ?? params.decision?.step_up?.authorizes_action ?? params.decision?.permission;
    const asked = params.decision?.step_up?.method;
    const method = params.method ?? (asked && asked !== "any" ? asked : undefined);
    if (!permission || !method) {
      throw new Error("authzStartStepUp needs a permission (or decision) and a method");
    }
    return this.post<{ challenge: { token: string; status: string; method: string; expires_at: string } }>(
      `${this._authPath}/challenges`,
      { purpose: "step_up", method, app_user_id: params.userId, metadata: { authorizes_action: permission } },
      this._authorizationHeader
    );
  }

  /**
   * The app's policy as a signed snapshot (RS256 JWS; keys at
   * /v1/auth/:app_id/jwks) for local decisions. See ScuteLocalAuthz.
   */
  async authzSnapshot() {
    return this.get<{ version: number; token: string; expires_at: string; jwks: string }>(
      `${this._appsPath}/authz/snapshot`,
      this._authorizationHeader
    );
  }

  /** Access requests: list (optionally by status or user). */
  async authzRequests(params: { status?: AuthzAccessRequest["status"]; userId?: UniqueIdentifier } = {}) {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.userId) query.set("user_id", String(params.userId));
    const qs = query.toString() ? `?${query}` : "";
    const { data, error } = await this.get<{ requests: AuthzAccessRequest[] }>(
      `${this._appsPath}/authz/requests${qs}`,
      this._authorizationHeader
    );
    return error ? { data: null, error } : { data: data.requests, error: null };
  }

  /** File a request for a user (a role, or approval for one operation). */
  async authzCreateRequest(userId: UniqueIdentifier, input: AuthzAccessRequestInput) {
    return this.post<AuthzAccessRequest>(
      `${this._appsPath}/authz/requests`,
      { user_id: userId, ...input },
      this._authorizationHeader
    );
  }

  /**
   * Approve or deny a request. Pass `reviewerId` when a user decides through
   * your UI (they must be a reviewer, and never the requester); without it
   * the decision is your backend's.
   */
  async authzDecideRequest(
    id: UniqueIdentifier,
    verdict: "approve" | "deny",
    options: { reviewerId?: UniqueIdentifier; note?: string } = {}
  ) {
    return this.post<AuthzAccessRequest>(
      `${this._appsPath}/authz/requests/${encodeURIComponent(id)}/${verdict}`,
      { reviewer_id: options.reviewerId, note: options.note },
      this._authorizationHeader
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
