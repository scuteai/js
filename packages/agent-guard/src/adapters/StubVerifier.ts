import { Identity, VerificationMeta, VerifierAdapter } from "../types";

export interface StubConfig {
  /** token string -> identity */
  identities?: Record<string, Identity>;
  /** role slug -> permission slugs */
  rolePermissions?: Record<string, string[]>;
  /** permission slug -> verification requirement */
  verification?: Record<string, { method?: string }>;
  /** `${identityId}:${permission}` entries that are already step-up verified */
  verified?: Set<string>;
}

/**
 * In-memory verifier for tests and local dev. NOT for production.
 * Production uses the Scute-backed verifier from @scute/js-core (ticket A02).
 */
export class StubVerifier implements VerifierAdapter {
  constructor(private cfg: StubConfig = {}) {}

  async resolveIdentity(token: string): Promise<Identity> {
    return this.cfg.identities?.[token] || { kind: "anonymous", roles: [] };
  }

  async can(identity: Identity, permission: string): Promise<boolean> {
    const perms = new Set<string>(identity.permissions || []);
    for (const role of identity.roles) {
      for (const p of this.cfg.rolePermissions?.[role] || []) perms.add(p);
    }
    return perms.has(permission);
  }

  async permissionMeta(
    _appId: string | undefined,
    permission: string
  ): Promise<VerificationMeta | null> {
    const v = this.cfg.verification?.[permission];
    if (!v) return { requiresVerification: false };
    return { requiresVerification: true, method: v.method };
  }

  async isVerified(identity: Identity, permission: string): Promise<boolean> {
    if (!identity.id) return false;
    return this.cfg.verified?.has(`${identity.id}:${permission}`) ?? false;
  }

  // --- live mutators (simulate dashboard rule edits / challenge completion) ---

  /** Grant permission(s) to a role (like editing the Rules matrix). */
  grant(role: string, ...permissions: string[]): this {
    this.cfg.rolePermissions = this.cfg.rolePermissions || {};
    const cur = new Set(this.cfg.rolePermissions[role] || []);
    permissions.forEach((p) => cur.add(p));
    this.cfg.rolePermissions[role] = Array.from(cur);
    return this;
  }

  revoke(role: string, ...permissions: string[]): this {
    const cur = new Set(this.cfg.rolePermissions?.[role] || []);
    permissions.forEach((p) => cur.delete(p));
    if (this.cfg.rolePermissions) this.cfg.rolePermissions[role] = Array.from(cur);
    return this;
  }

  /** Mark a permission as requiring step-up verification (attach a challenge). */
  requireVerification(permission: string, method = "otp"): this {
    this.cfg.verification = this.cfg.verification || {};
    this.cfg.verification[permission] = { method };
    return this;
  }

  clearVerification(permission: string): this {
    if (this.cfg.verification) delete this.cfg.verification[permission];
    return this;
  }

  /** Record that a user satisfied step-up for a permission (challenge passed). */
  markVerified(identityId: string, permission: string): this {
    this.cfg.verified = this.cfg.verified || new Set();
    this.cfg.verified.add(`${identityId}:${permission}`);
    return this;
  }

  addIdentity(token: string, identity: Identity): this {
    this.cfg.identities = this.cfg.identities || {};
    this.cfg.identities[token] = identity;
    return this;
  }
}
