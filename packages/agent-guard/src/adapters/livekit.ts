import { AgentGuard } from "../AgentGuard";
import { Identity, Layer, ToolContext } from "../types";
import { ToolResponse, toToolResponse } from "./webhook";

/**
 * LiveKit carries identity in the participant's access token attributes (set
 * server-side when minting the join token; ticket A07). Read them off the
 * RunContext's participant and turn them into a Scute Identity.
 *
 * Expected attributes (stamped at token mint time):
 *   scute_user_id, scute_roles (comma-separated), scute_kind ("user" | "m2m")
 */
export function identityFromLiveKitAttributes(
  attrs: Record<string, string | undefined> | undefined | null
): Identity {
  if (!attrs || !attrs.scute_user_id) return { kind: "anonymous", roles: [] };
  const kind = attrs.scute_kind === "m2m" ? "m2m" : "user";
  const roles = (attrs.scute_roles || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { kind, id: attrs.scute_user_id, roles };
}

export interface LiveKitToolDef<A = any, R = any> {
  name: string;
  permission: string;
  /** guardrail rungs (args/velocity/...) layered on top of RBAC */
  layers?: Layer[];
  run: (args: A, ctx: ToolContext) => Promise<R> | R;
}

/**
 * Wrap a LiveKit function tool so every invocation is gated by the guard for the
 * given identity. Returns an async fn you register as the tool's handler; it
 * runs the underlying tool only when allowed and returns a ToolResponse whose
 * `message` the agent surfaces to the caller on a block/challenge.
 */
// `actor` should be the participant's Scute token when available (the gate then
// resolves permissions LIVE via /authorize, so a mid-call grant takes effect
// immediately). An Identity also works but is authorized against its own
// resolved permissions only.
export function guardedLiveKitTool<A = any, R = any>(
  guard: AgentGuard,
  actor: string | Identity,
  def: LiveKitToolDef<A, R>
): (args: A) => Promise<ToolResponse> {
  const runner = guard.tool(def);
  return async (args: A) => toToolResponse(await runner(args, { actor }));
}
