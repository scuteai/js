import { ScuteBaseHttp } from "./lib/ScuteBaseHttp";
import type { UniqueIdentifier } from "./lib/types/general";
import type { AuthzAccessRequest } from "./ScuteAuthzApi";

export type ElementUser = {
  id: UniqueIdentifier;
  email?: string;
  name?: string;
  roles: { role: string; source: string; expires_at: string | null; active: boolean }[];
};

export type ElementRole = { slug: string; name: string; description?: string | null };

export type ElementDecision = {
  id: UniqueIdentifier;
  at: string;
  user_id?: UniqueIdentifier;
  permission?: string;
  resource?: string;
  decision: string;
  reason?: string;
  roles?: string[];
  explanation?: string;
};

export type ScuteElementsApiConfig = {
  appId: UniqueIdentifier;
  /** An element token your backend minted (POST /v1/apps/:app_id/authz/element-tokens). */
  token: string;
  baseUrl?: string;
  errorReporting?: boolean;
};

/**
 * The API behind embeddable admin screens, for the browser, with a
 * short-lived element token instead of the app secret. The token decides
 * which users are visible and which roles may be granted.
 */
class ScuteElementsApi extends ScuteBaseHttp {
  private readonly appId: UniqueIdentifier;
  private readonly token: string;

  constructor(config: ScuteElementsApiConfig) {
    super(config.errorReporting ?? false, config.baseUrl || "https://api.scute.io");
    this.appId = config.appId;
    this.token = config.token;
  }

  private get path() {
    return `/v1/auth/${this.appId}/authz/elements`;
  }

  private get headers(): HeadersInit {
    return { "X-Scute-Element-Token": this.token };
  }

  async users(params: { q?: string; limit?: number; offset?: number } = {}) {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.limit) query.set("limit", String(params.limit));
    if (params.offset) query.set("offset", String(params.offset));
    const qs = query.toString() ? `?${query}` : "";
    return this.get<{ total: number; users: ElementUser[] }>(`${this.path}/users${qs}`, this.headers);
  }

  async roles() {
    return this.get<{ roles: ElementRole[]; assignable: string[] }>(`${this.path}/roles`, this.headers);
  }

  async assignRole(userId: UniqueIdentifier, role: string, expiresAt?: string) {
    return this.post<{ role: string; source: string; expires_at: string | null }>(
      `${this.path}/users/${encodeURIComponent(userId)}/roles`,
      { role, expires_at: expiresAt },
      this.headers
    );
  }

  async revokeRole(userId: UniqueIdentifier, role: string) {
    return this.delete(
      `${this.path}/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(role)}`,
      this.headers
    );
  }

  async requests(status: AuthzAccessRequest["status"] = "pending") {
    const { data, error } = await this.get<{ requests: AuthzAccessRequest[] }>(
      `${this.path}/requests?status=${encodeURIComponent(status)}`,
      this.headers
    );
    return error ? { data: null, error } : { data: data.requests, error: null };
  }

  async approve(id: UniqueIdentifier, note?: string) {
    return this.post<AuthzAccessRequest>(`${this.path}/requests/${encodeURIComponent(id)}/approve`, { note }, this.headers);
  }

  async deny(id: UniqueIdentifier, note?: string) {
    return this.post<AuthzAccessRequest>(`${this.path}/requests/${encodeURIComponent(id)}/deny`, { note }, this.headers);
  }

  async decisions(params: { userId?: UniqueIdentifier; decision?: string; before?: UniqueIdentifier; limit?: number } = {}) {
    const query = new URLSearchParams();
    if (params.userId) query.set("user_id", String(params.userId));
    if (params.decision) query.set("decision", params.decision);
    if (params.before) query.set("before", String(params.before));
    if (params.limit) query.set("limit", String(params.limit));
    const qs = query.toString() ? `?${query}` : "";
    return this.get<{ decisions: ElementDecision[]; next?: UniqueIdentifier }>(`${this.path}/decisions${qs}`, this.headers);
  }
}

export default ScuteElementsApi;
