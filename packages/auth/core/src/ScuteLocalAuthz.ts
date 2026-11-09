import type ScuteAdminApi from "./ScuteAdminApi";
import type { AuthzDecision, AuthzResource } from "./ScuteAuthzApi";
import type { UniqueIdentifier } from "./lib/types/general";
import { decideLocally, type AuthzPolicy, type LocalDecision } from "./lib/localAuthz";

export type ScuteLocalAuthzOptions = {
  /** Re-fetch the snapshot after this long (default 30s). */
  refreshMs?: number;
  /** Cache each user's roles this long (default 30s). */
  rolesTtlMs?: number;
  /** Deny on missing attributes like the server, instead of asking it. */
  strict?: boolean;
  /**
   * Stop deciding locally when the last verified snapshot is older than
   * this (default 5 × refreshMs, at least 60s); checks go to the API until a
   * fresh snapshot verifies. A snapshot past its `exp` is never used.
   */
  maxStaleMs?: number;
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
  private expiresAt = 0;
  private inflight: Promise<void> | null = null;
  private readonly roles = new Map<string, { roles: string[]; at: number }>();

  constructor(private readonly admin: ScuteAdminApi, private readonly options: ScuteLocalAuthzOptions = {}) {}

  /** The policy version in use, or null before the first fetch. */
  get policyVersion() {
    return this.version;
  }

  /**
   * Fetch the snapshot and verify it (RS256 signature against the app's
   * JWKS, audience, expiry). Rejects, keeping the previous policy, when the
   * snapshot can't be fetched or doesn't verify.
   */
  async refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const { data: claims, error } = await this.admin.verifiedAuthzSnapshot();
        if (error || !claims) throw error ?? new Error("No snapshot");
        if (claims.version !== this.version) this.roles.clear();
        this.policy = claims.policy;
        this.version = claims.version;
        this.expiresAt = typeof claims.exp === "number" ? claims.exp * 1000 : 0;
        this.fetchedAt = Date.now();
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  private get refreshMs() {
    return this.options.refreshMs ?? 30_000;
  }

  /** The verified policy, or null when there is none or it is too old to trust. */
  private usablePolicy(): AuthzPolicy | null {
    if (!this.policy) return null;
    const now = Date.now();
    const maxStale = this.options.maxStaleMs ?? Math.max(5 * this.refreshMs, 60_000);
    if (now >= this.expiresAt || now - this.fetchedAt > maxStale) return null;
    return this.policy;
  }

  private async ensurePolicy(): Promise<AuthzPolicy | null> {
    if (!this.usablePolicy()) {
      // Nothing trustworthy to answer from: wait for a verified snapshot,
      // and ask the API if none comes.
      await this.refresh().catch(() => {});
      return this.usablePolicy();
    }
    if (Date.now() - this.fetchedAt >= this.refreshMs) void this.refresh().catch(() => {});
    return this.usablePolicy();
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
    const policy = await this.ensurePolicy();
    const roles = policy ? await this.rolesFor(params.userId) : null;
    if (policy && roles) {
      const local = decideLocally(policy, {
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
