import { ScuteBaseHttp } from "./lib/ScuteBaseHttp";
import { accessTokenHeader } from "./lib/helpers";
import type { UniqueIdentifier } from "./lib/types/general";

// ── Types ──

/** "document", "document:42" or { type, key, attributes }. */
export type AuthzResource =
  | string
  | { type: string; key?: string; attributes?: Record<string, unknown> };

export type AuthzDecision = {
  decision: "allow" | "deny" | "allow_with_step_up";
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
  explanation?: string;
};

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

  /** Everything the signed-in user can do, app-wide or on one object. */
  async permissions(resource?: string) {
    const query = resource ? `?resource=${encodeURIComponent(resource)}` : "";
    return this.get<AuthzPermissions>(`${this.path}/permissions${query}`, await this.authHeaders());
  }
}

export default ScuteAuthzApi;
