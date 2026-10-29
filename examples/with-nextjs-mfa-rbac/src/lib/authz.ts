// Permission checks on the server, with your app's secret key.
//
// Scute makes the decision (roles, permissions, step-up) and logs it; your
// server enforces it. Import this only from server code: route handlers,
// server actions, server components.

import { ScuteAdminApi, type AuthzDecision, type UniqueIdentifier } from "@scute/nextjs-handlers";

const baseUrl = process.env.NEXT_PUBLIC_SCUTE_BASE_URL || "https://api.scute.io";
const appId = process.env.NEXT_PUBLIC_SCUTE_APP_ID!;
const secretKey = process.env.SCUTE_SECRET;

const admin = () => new ScuteAdminApi({ appId, baseUrl, secretKey });

export type ProjectAction = "view" | "edit";

/**
 * May this user do `action` on projects? Pass `challenge` (a step-up
 * challenge's token, verified with verifyStepUp) to settle a step-up.
 *
 * Only `decision.allowed` lets the action through: it is true for a plain
 * "allow", never for "allow_with_step_up". If Scute can't be reached the
 * answer is a deny, never an allow.
 */
export async function checkProject(userId: UniqueIdentifier, action: ProjectAction, challenge?: string): Promise<AuthzDecision> {
  const { data, error } = await admin().authzCheck({ userId, action, resource: "project", challenge });
  if (error || !data) {
    return { decision: "deny", allowed: false, reason: "check_failed", explanation: "Couldn't check the permission." };
  }
  return data;
}

/**
 * Start the verification a step-up decision asks for: Scute emails the user
 * a code. Returns the challenge token, which the user sends back with the
 * code.
 */
export async function startStepUp(userId: UniqueIdentifier, decision: AuthzDecision) {
  const { data, error } = await admin().authzStartStepUp({ userId, decision });
  if (error || !data) return null;
  return data.challenge.token;
}

/**
 * Check the code the user typed against the step-up challenge. The SDK has
 * no helper for this yet, so it calls the API's challenge endpoint (it needs
 * the secret key, so it runs here, never in the browser).
 */
export async function verifyStepUp(token: string, code: string) {
  const res = await fetch(`${baseUrl}/v1/auth/${appId}/challenges/${encodeURIComponent(token)}/verify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
    cache: "no-store",
  });
  return res.ok;
}

export type LoggedDecision = {
  id: string;
  at: string;
  permission: string;
  decision: AuthzDecision["decision"];
  reason: string;
  explanation?: string;
};

/**
 * The newest entries of the app's decision log for one user. Scute writes
 * the log a moment after each check. The SDK has no helper for this list
 * yet, so it calls the API.
 */
export async function recentDecisions(userId: UniqueIdentifier, limit = 5): Promise<LoggedDecision[]> {
  const query = new URLSearchParams({ user_id: String(userId), limit: String(limit) });
  const res = await fetch(`${baseUrl}/v1/apps/${appId}/authz/decisions?${query}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { decisions?: LoggedDecision[] };
  return body.decisions ?? [];
}
