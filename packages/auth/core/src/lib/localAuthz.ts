// Local authorization decisions from a signed policy snapshot, without a
// network round trip per check. Same answers as the Scute API for app-wide
// roles, conditions, step-up and approval flags (checked against shared
// conformance vectors produced by the API's engine).
//
// What a snapshot can't know is answered as { decision: "unknown",
// reason: "needs_server" }: roles held on one object (the relationship
// graph lives on the server), and, unless `strict`, conditions that read an
// attribute you didn't pass. ScuteLocalAuthz falls back to the API for those.
//
// Staleness: a snapshot is as fresh as its last refresh (ScuteLocalAuthz
// re-fetches every `refreshMs`, cheaply: the API answers 304 while the
// policy version holds). A verification cached after a step-up isn't in the
// snapshot either, so local step-up answers stay "allow_with_step_up"; the
// server check on the real action settles it.

import { evaluateCondition, type AuthzCondition } from "./authzFilter";

export type AuthzPolicy = {
  permissions: Record<
    string,
    {
      enabled: boolean;
      requires_verification?: boolean;
      verification_method?: string | null;
      verification_ttl?: number | null;
      requires_approval?: boolean;
    }
  >;
  roles: Record<
    string,
    { name?: string; default?: boolean; permissions: string[]; conditions?: Record<string, AuthzCondition> }
  >;
  resources?: Record<
    string,
    { roles?: Record<string, { permissions: string[] }>; relations?: Record<string, unknown>; derivations?: unknown[] }
  >;
};

export type LocalCheck = {
  /** Role slugs the user holds (defaults are added for you). */
  roles: string[];
  /** The user's attributes for conditions (metadata and the like). */
  user?: Record<string, unknown>;
  action: string;
  resource?: string | { type: string; key?: string; attributes?: Record<string, unknown> };
  context?: Record<string, unknown>;
  /** Clock for context.now / hour_utc / weekday_utc (default: now). */
  now?: Date | string;
  /** Treat a missing attribute like the server does (deny) instead of asking the server. */
  strict?: boolean;
};

export type LocalDecision = {
  decision: "allow" | "deny" | "allow_with_step_up" | "allow_with_approval" | "unknown";
  allowed: boolean;
  reason: string;
  permission?: string;
  roles?: string[];
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const parseResource = (resource: LocalCheck["resource"]) => {
  if (!resource) return { type: undefined, key: undefined, attributes: {} as Record<string, unknown> };
  if (typeof resource === "string") {
    const i = resource.indexOf(":");
    return i < 0
      ? { type: resource, key: undefined, attributes: {} }
      : { type: resource.slice(0, i), key: resource.slice(i + 1), attributes: {} };
  }
  return { type: resource.type, key: resource.key, attributes: resource.attributes ?? {} };
};

const compact = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

const decision = (
  d: LocalDecision["decision"],
  reason: string,
  permission?: string,
  roles?: string[]
): LocalDecision => ({
  decision: d,
  allowed: d === "allow",
  reason,
  ...(permission ? { permission } : {}),
  ...(roles && roles.length ? { roles } : {}),
});

export function decideLocally(policy: AuthzPolicy, check: LocalCheck): LocalDecision {
  const { type, key, attributes } = parseResource(check.resource);
  const action = check.action.trim().toLowerCase();
  const slug = type ? `${type.trim().toLowerCase()}:${action}` : action;
  const perm = policy.permissions[slug];
  if (!perm) return decision("deny", "unknown_permission", slug);
  if (!perm.enabled) return decision("deny", "permission_disabled", slug);

  const defaults = Object.entries(policy.roles)
    .filter(([, r]) => r.default)
    .map(([s]) => s);
  const held = Array.from(new Set([...check.roles, ...defaults]))
    .filter((r) => policy.roles[r])
    .sort();
  const granting = held.filter((r) => policy.roles[r].permissions.includes(slug));
  const conditionOf = (r: string) => policy.roles[r].conditions?.[slug];

  const now = check.now ? new Date(check.now) : new Date();
  const attrs = {
    user: compact(check.user ?? {}),
    resource: compact({ ...attributes, type, key }),
    context: {
      now: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
      hour_utc: now.getUTCHours(),
      weekday_utc: WEEKDAYS[now.getUTCDay()],
      ...(check.context ?? {}),
    },
  };

  let failed = false;
  let unknown = false;
  const unconditional = granting.filter((r) => !conditionOf(r));
  const passing = unconditional.length
    ? unconditional
    : granting.filter((r) => {
        const result = evaluateCondition(conditionOf(r)!, attrs);
        if (result === "unknown") unknown = true;
        if (result !== true) failed = true;
        return result === true;
      });

  if (passing.length) {
    if (perm.requires_approval) return decision("allow_with_approval", "approval_required", slug, passing);
    if (perm.requires_verification) return decision("allow_with_step_up", "verification_required", slug, passing);
    return decision("allow", "role_grant", slug, passing);
  }

  // Roles on one object live on the server.
  const objectRoles = type ? policy.resources?.[type]?.roles ?? {} : {};
  if (key && Object.values(objectRoles).some((r) => r.permissions.includes(slug))) {
    return decision("unknown", "needs_server", slug);
  }
  if (unknown && !check.strict) return decision("unknown", "needs_server", slug);
  if (failed) return decision("deny", "condition_failed", slug);
  return decision("deny", "no_role_grants_permission", slug);
}

// ── Snapshot signature ────────────────────────────────────────────────

const b64urlToBytes = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export type SnapshotClaims = {
  typ: "scute-authz-snapshot";
  aud: string;
  iat: number;
  exp: number;
  version: number;
  policy: AuthzPolicy;
};

/**
 * Verify a snapshot token (RS256 JWS) against the app's JWKS
 * (GET /v1/auth/:app_id/jwks) and return its claims. Throws when the
 * signature, audience, type or expiry doesn't hold. Uses WebCrypto.
 */
export async function verifySnapshotToken(
  token: string,
  jwks: { keys: (JsonWebKey & { kid?: string })[] },
  appId: string,
  now: Date = new Date()
): Promise<SnapshotClaims> {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new Error("Not a JWS");
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
  if (header.alg !== "RS256") throw new Error(`Unsupported alg ${header.alg}`);
  const jwk = jwks.keys.find((k) => !header.kid || k.kid === header.kid);
  if (!jwk) throw new Error("No matching key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(s),
    new TextEncoder().encode(`${h}.${p}`)
  );
  if (!ok) throw new Error("Bad signature");
  const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(p))) as SnapshotClaims;
  if (claims.typ !== "scute-authz-snapshot") throw new Error("Not a snapshot");
  if (claims.aud !== appId) throw new Error("Snapshot is for another app");
  if (claims.exp * 1000 <= now.getTime()) throw new Error("Snapshot expired");
  return claims;
}

export const decodeSnapshotToken = (token: string): SnapshotClaims =>
  JSON.parse(new TextDecoder().decode(b64urlToBytes(token.split(".")[1] ?? "")));
