import { ScuteBaseHttp } from "./lib/ScuteBaseHttp";
import { accessTokenHeader } from "./lib/helpers";
import type { UniqueIdentifier } from "./lib/types/general";

// ── Types ──

/** "document", "document:42" or { type, key, attributes }. */
export type AuthzResource =
  | string
  | { type: string; key?: string; attributes?: Record<string, unknown> };

export type AuthzDecision = {
  decision: "allow" | "deny" | "allow_with_step_up" | "allow_with_approval";
  /** true only for "allow". A step-up answer is false until verified. */
  allowed: boolean;
  reason: string;
  permission?: string;
  roles?: string[];
  /** For roles held through relationships: how the user came to hold it. */
  path?: { instance: string; role: string; via?: string }[];
  /** Conditions that held, for conditional grants. */
  conditions?: string[];
  /**
   * Present when the permission needs a fresh verification. Your backend
   * starts a step-up challenge bound to `authorizes_action` (see
   * ScuteAdminApi.authzStartStepUp) and checks again with its token.
   */
  step_up?: {
    method: string;
    ttl?: number;
    authorizes_action: string;
    error?: string;
    detail?: string;
  };
  /**
   * Present when the permission needs a reviewer's approval. The user files
   * a request (scute.authz.requestAccess); once approved, your backend
   * checks again with `approval: <request id>`. Each approval works once.
   */
  approval?: { permission: string; resource?: string; error?: string };
  explanation?: string;
};

export type AuthzAccessRequest = {
  id: UniqueIdentifier;
  kind: "role" | "operation";
  user_id: UniqueIdentifier;
  status: "pending" | "approved" | "denied" | "cancelled" | "expired" | "used";
  role?: string;
  resource_role?: string;
  resource?: string;
  permission?: string;
  reason?: string;
  duration_seconds?: number;
  expires_at: string;
  decided_at?: string;
  decided_by?: string;
  decision_note?: string;
  used_at?: string;
  created_at: string;
};

/** A role (app-wide, or on one object with `resource`), or approval for one operation. */
export type AuthzAccessRequestInput =
  | { role: string; resource?: string; duration?: number; reason?: string }
  | { action: string; resource?: AuthzResource; reason?: string };

export type AuthzCheck = {
  action: string;
  resource?: AuthzResource;
  context?: Record<string, unknown>;
};

export type AuthzPermissions = {
  user_id: UniqueIdentifier;
  roles: string[];
  permissions: string[];
  step_up: string[];
  conditional?: { permission: string; when: string[] }[];
  verified_until?: Record<string, string>;
  resource?: string;
  resource_roles?: string[];
};

export type ScuteAuthzApiConfig = {
  appId: UniqueIdentifier;
  baseUrl?: string;
  errorReporting?: boolean;
  getAccessToken: () => Promise<string | null>;
};

// ── API Class ──

/**
 * Permission checks for the signed-in user, from the browser (`scute.authz`).
 * The app must allow client checks (authz settings: `client_checks`).
 *
 * These answer what the UI should show. Your backend still checks on the
 * real action (ScuteAdminApi.authzCheck), which is also where step-up
 * verifications are redeemed.
 */
class ScuteAuthzApi extends ScuteBaseHttp {
  private readonly appId: UniqueIdentifier;
  private readonly getAccessToken: () => Promise<string | null>;

  constructor(config: ScuteAuthzApiConfig) {
    const baseUrl = config.baseUrl || "https://api.scute.io";
    super(config.errorReporting ?? false, baseUrl);
    this.appId = config.appId;
    this.getAccessToken = config.getAccessToken;
  }

  private get path() {
    return `/v1/auth/${this.appId}/authz/me`;
  }

  private async authHeaders(): Promise<HeadersInit> {
    return accessTokenHeader(await this.getAccessToken());
  }

  /** May the signed-in user do `action` (on `resource`)? */
  async can(action: string, resource?: AuthzResource, context?: Record<string, unknown>) {
    return this.post<AuthzDecision>(
      `${this.path}/check`,
      { action, resource, context },
      await this.authHeaders()
    );
  }

  /** Up to 100 checks in one call; results come back in order. */
  async canMany(checks: AuthzCheck[]) {
    const { data, error } = await this.post<{ results: AuthzDecision[] }>(
      `${this.path}/check-batch`,
      { checks },
      await this.authHeaders()
    );
    return error ? { data: null, error } : { data: data.results, error: null };
  }

  // ── Access requests (the app must allow them: authz settings `access_requests`) ──

  /** Ask for a role, or for approval of one operation. */
  async requestAccess(input: AuthzAccessRequestInput) {
    return this.post<AuthzAccessRequest>(`${this.path}/requests`, input, await this.authHeaders());
  }

  /** The signed-in user's own requests. */
  async myRequests(status?: AuthzAccessRequest["status"]) {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const { data, error } = await this.get<{ requests: AuthzAccessRequest[] }>(
      `${this.path}/requests${query}`,
      await this.authHeaders()
    );
    return error ? { data: null, error } : { data: data.requests, error: null };
  }

  async cancelRequest(id: UniqueIdentifier) {
    return this.delete(`${this.path}/requests/${encodeURIComponent(id)}`, await this.authHeaders());
  }

  /** Pending requests the signed-in user may review (empty if they aren't a reviewer). */
  async reviews() {
    const { data, error } = await this.get<{ requests: AuthzAccessRequest[] }>(
      `${this.path}/reviews`,
      await this.authHeaders()
    );
    return error ? { data: null, error } : { data: data.requests, error: null };
  }

  async approveRequest(id: UniqueIdentifier, note?: string) {
    return this.post<AuthzAccessRequest>(
      `${this.path}/reviews/${encodeURIComponent(id)}/approve`,
      { note },
      await this.authHeaders()
    );
  }

  async denyRequest(id: UniqueIdentifier, note?: string) {
    return this.post<AuthzAccessRequest>(
      `${this.path}/reviews/${encodeURIComponent(id)}/deny`,
      { note },
      await this.authHeaders()
    );
  }

  /** Everything the signed-in user can do, app-wide or on one object. */
  async permissions(resource?: string) {
    const query = resource ? `?resource=${encodeURIComponent(resource)}` : "";
    return this.get<AuthzPermissions>(`${this.path}/permissions${query}`, await this.authHeaders());
  }
}

export default ScuteAuthzApi;
