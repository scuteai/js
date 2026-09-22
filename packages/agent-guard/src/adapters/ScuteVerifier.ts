import {
  AuthorizeDecision,
  Identity,
  VerificationMeta,
  VerifierAdapter,
} from "../types";

/** Minimal fetch shape so we don't depend on DOM/Node lib typings. */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export interface ScuteVerifierOptions {
  /** Scute API base, e.g. https://api.scute.io */
  baseUrl: string;
  /** the app's public id */
  appId: string;
  /** injectable fetch (defaults to global fetch) */
  fetchImpl?: FetchLike;
}

/**
 * Production verifier backed by the Scute RBAC endpoints (ticket A02):
 *   GET  /v1/auth/:app_id/current_user/permissions  -> live roles + permissions
 *   POST /v1/auth/:app_id/current_user/authorize     -> authoritative decision
 *
 * Reads are live, so revoking a role takes effect on the next action. The gate
 * prefers authorize() (one authoritative call covering RBAC + the verification
 * gate + M2M escalation).
 */
export class ScuteVerifier implements VerifierAdapter {
  private baseUrl: string;
  private appId: string;
  private fetchImpl: FetchLike;

  constructor(opts: ScuteVerifierOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.appId = opts.appId;
    this.fetchImpl = opts.fetchImpl || ((globalThis as any).fetch as FetchLike);
  }

  private url(path: string): string {
    return `${this.baseUrl}/v1/auth/${this.appId}/current_user${path}`;
  }

  async resolveIdentity(token: string): Promise<Identity> {
    const res = await this.fetchImpl(this.url("/permissions"), {
      headers: { "X-Authorization": `Bearer ${token}` },
    });
    if (!res.ok) return { kind: "anonymous", roles: [] };
    const body = await res.json();
    return {
      kind: body.m2m ? "m2m" : "user",
      id: body.user_id || undefined,
      appId: this.appId,
      roles: body.roles || [],
      permissions: body.permissions || [],
    };
  }

  async can(identity: Identity, permission: string): Promise<boolean> {
    return (identity.permissions || []).includes(permission);
  }

  // Unused when authorize() is available (the gate prefers it). Reported as
  // "no gate" so the fallback path stays permissive about verification.
  async permissionMeta(): Promise<VerificationMeta | null> {
    return { requiresVerification: false };
  }

  async authorize(token: string, permission: string): Promise<AuthorizeDecision> {
    const res = await this.fetchImpl(this.url("/authorize"), {
      method: "POST",
      headers: {
        "X-Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ permission }),
    });
    let body: any = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    return {
      allowed: res.ok && body.allowed === true,
      requiresVerification: body.requires_verification === true,
      verificationMethod: body.verification_method || undefined,
    };
  }
}
