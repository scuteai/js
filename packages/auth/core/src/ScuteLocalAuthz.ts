import type ScuteAdminApi from "./ScuteAdminApi";
import type { AuthzDecision, AuthzResource } from "./ScuteAuthzApi";
import type { UniqueIdentifier } from "./lib/types/general";
import { decideLocally, decodeSnapshotToken, type AuthzPolicy, type LocalDecision } from "./lib/localAuthz";

export type ScuteLocalAuthzOptions = {
  /** Re-fetch the snapshot after this long (default 30s). */
  refreshMs?: number;
  /** Cache each user's roles this long (default 30s). */
  rolesTtlMs?: number;
  /** Deny on missing attributes like the server, instead of asking it. */
  strict?: boolean;
};

/**
 * Server-side checks decided locally from the app's policy snapshot, with
 * the API as the fallback for what a snapshot can't answer (roles on one
 * object, attributes you didn't pass). Needs ScuteAdminApi (secret key).
 *
 *     const authz = new ScuteLocalAuthz(scute.admin);
 *     const d = await authz.check({ userId, action: "edit", resource: "document", user: { region: "eu" } });
 */
export class ScuteLocalAuthz {
  private policy: AuthzPolicy | null = null;
  private version: number | null = null;
  private fetchedAt = 0;
  private inflight: Promise<void> | null = null;
  private readonly roles = new Map<string, { roles: string[]; at: number }>();

  constructor(private readonly admin: ScuteAdminApi, private readonly options: ScuteLocalAuthzOptions = {}) {}

  /** The policy version in use, or null before the first fetch. */
  get policyVersion() {
    return this.version;
  }

  async refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const { data, error } = await this.admin.authzSnapshot();
        if (error || !data) throw error ?? new Error("No snapshot");
        const claims = decodeSnapshotToken(data.token);
        if (claims.version !== this.version) this.roles.clear();
        this.policy = claims.policy;
        this.version = claims.version;
        this.fetchedAt = Date.now();
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  private async ensurePolicy() {
    const stale = Date.now() - this.fetchedAt > (this.options.refreshMs ?? 30_000);
    if (!this.policy) return this.refresh();
    if (stale) void this.refresh().catch(() => {}); // keep answering from the last good snapshot
  }

  private async rolesFor(userId: UniqueIdentifier): Promise<string[] | null> {
    const hit = this.roles.get(String(userId));
    if (hit && Date.now() - hit.at < (this.options.rolesTtlMs ?? 30_000)) return hit.roles;
    const { data, error } = await this.admin.authzUserPermissions(userId);
    if (error || !data) return null;
    this.roles.set(String(userId), { roles: data.roles, at: Date.now() });
    return data.roles;
  }

  /** Decide locally when possible, else ask the API. */
  async check(params: {
    userId: UniqueIdentifier;
    action: string;
    resource?: AuthzResource;
    context?: Record<string, unknown>;
    /** The user's attributes for conditions. */
    user?: Record<string, unknown>;
  }): Promise<LocalDecision | AuthzDecision | null> {
    await this.ensurePolicy();
    const roles = await this.rolesFor(params.userId);
    if (this.policy && roles) {
      const local = decideLocally(this.policy, {
        roles,
        user: params.user,
        action: params.action,
        resource: params.resource,
        context: params.context,
        strict: this.options.strict,
      });
      if (local.decision !== "unknown") return local;
    }
    const { data } = await this.admin.authzCheck({
      userId: params.userId,
      action: params.action,
      resource: params.resource,
      context: params.context,
    });
    return data;
  }
}

export default ScuteLocalAuthz;
