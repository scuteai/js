import type { UniqueIdentifier } from "./general";
import type { AuthzDecision } from "../../ScuteAuthzApi";

// Types for managing an app's authorization policy with the secret key
// (ScuteAdminApi.authzResources, authzRoles, authzPermissions, ...).

/** A role grant can carry a condition over the resource, e.g. `{ lt: [{ var: "resource.amount" }, 5000] }`. */
export type AuthzRolePermissionInput =
  | string
  | { permission: string; when: Record<string, unknown> };

/** A challenge method such as "email_otp", "sms_otp", "totp" or "entra_push"; blank or "any" accepts any. */
export type AuthzVerificationMethod = string;

/** A kind of thing your app guards ("project"), with the actions on it ("view", "edit"). Each action is a permission ("project:view"). */
export type AuthzPolicyResource = {
  slug: string;
  name: string;
  description?: string | null;
  actions: string[];
  /** Roles held per object, and relations. Read with `authzResources`; edit them in the dashboard. */
  roles: Record<string, unknown>[];
  relations: { slug: string; subject: string }[];
};

export type AuthzResourceInput = {
  slug: string;
  name: string;
  description?: string;
  actions?: string[];
};

export type AuthzPolicyPermission = {
  slug: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  /** The resource and action this permission comes from; `custom` permissions have neither. */
  resource: string | null;
  action: string | null;
  custom: boolean;
  requires_verification: boolean;
  verification_method?: AuthzVerificationMethod | null;
  /** Seconds one verification stays valid. */
  verification_ttl?: number | null;
  requires_approval: boolean;
  autonomous_allowed: boolean;
  blocked_while_impersonating: boolean;
  requester_only: boolean;
};

/** What a permission can be changed to. Only the fields you pass change. */
export type AuthzPermissionChanges = Partial<{
  name: string;
  description: string;
  enabled: boolean;
  requires_verification: boolean;
  verification_method: AuthzVerificationMethod;
  verification_ttl: number;
  requires_approval: boolean;
  autonomous_allowed: boolean;
  blocked_while_impersonating: boolean;
  requester_only: boolean;
}>;

/** A custom permission, not tied to a resource. */
export type AuthzPermissionInput = AuthzPermissionChanges & { slug: string; name: string };

export type AuthzPolicyRole = {
  slug: string;
  name: string;
  description?: string | null;
  /** Everyone who signs in holds a default role. */
  is_default: boolean;
  deletable: boolean;
  permissions: string[];
  /** Conditional grants: permission slug to condition. */
  conditions?: Record<string, Record<string, unknown>>;
  /** How many users hold the role now. */
  holders: number;
};

export type AuthzRoleChanges = Partial<{
  name: string;
  description: string;
  is_default: boolean;
  position: number;
  /** Replaces the role's permissions. */
  permissions: AuthzRolePermissionInput[];
}>;

export type AuthzRoleInput = AuthzRoleChanges & { slug: string; name: string };

/** A role a user holds. */
export type AuthzRoleGrant = {
  role: string;
  expires_at: string | null;
  /** "manual", or the identity provider that manages it (e.g. "scim"). */
  source: string;
  active: boolean;
};

export type AuthzUserRoles = {
  user_id: UniqueIdentifier;
  roles: AuthzRoleGrant[];
  default_roles: string[];
  /** Roles held on single objects. */
  resource_roles: { role: string; resource: string; expires_at: string | null; active: boolean }[];
};

export type AuthzSettings = {
  /** Share of "allow" answers kept in the decision log (0 to 1). Denials are always kept. */
  log_allow_rate: number;
  log_retention_days: number;
  /** Signed-in users may ask about their own permissions from the browser. */
  client_checks: boolean;
  access_requests: boolean;
  gateway: boolean;
  gateway_unmatched: "deny" | "allow";
  impersonation: boolean;
  impersonation_max_minutes: number;
  impersonation_protected_roles: string[];
  session_trust: boolean;
  session_trust_minutes: number;
  export_event: string;
};

export type AuthzSettingsChanges = Partial<Omit<AuthzSettings, "export_event">>;

/** One row of the decision log. */
export type AuthzLoggedDecision = {
  id: UniqueIdentifier;
  at: string;
  kind?: string;
  user_id?: UniqueIdentifier;
  agent_id?: UniqueIdentifier;
  task_id?: UniqueIdentifier;
  permission?: string;
  resource?: string;
  decision: AuthzDecision["decision"];
  reason: string;
  roles?: string[];
  policy_version?: number;
  latency_ms?: number;
  explanation?: string;
  details?: Record<string, unknown>;
  /** Position in the log's hash chain (see `verifyDecisionLog`). */
  seq?: number;
  row_hash?: string;
};

/** Filters for the decision log. Times are ISO strings or Dates. */
export type AuthzDecisionsParams = {
  userId?: UniqueIdentifier;
  agentId?: UniqueIdentifier;
  taskId?: UniqueIdentifier;
  decision?: AuthzDecision["decision"];
  permission?: string;
  resource?: string;
  reason?: string;
  /** From this time on. */
  since?: string | Date;
  /** Before this time. */
  until?: string | Date;
  /** 1 to 200, default 50. */
  limit?: number;
  /** A page's `next`: the entries older than it. */
  before?: UniqueIdentifier;
};

export type AuthzDecisionsPage = {
  decisions: AuthzLoggedDecision[];
  /** Pass as `before` for the next page; missing on the last page. */
  next?: UniqueIdentifier;
};

/** A step-up challenge once its code checked out. */
export type AuthzStepUpVerified = {
  status: "completed";
  challenge: {
    token: string;
    status: string;
    purpose: string;
    method: string;
    expires_at: string;
    remaining_attempts?: number;
    time_remaining?: number;
  };
};
