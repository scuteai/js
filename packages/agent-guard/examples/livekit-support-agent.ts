/**
 * Example: a LiveKit voice/chat support agent guarded by Scute.
 *
 * Identity flows in via the participant's LiveKit access-token attributes
 * (stamped server-side at join time), every tool call is gated by Scute RBAC,
 * and the agent surfaces a caller-facing message on a block/challenge.
 *
 * Run the gate end-to-end (no LiveKit infra needed) via the e2e test:
 *   pnpm --filter @scute/agent-guard test livekit-example
 *
 * --- WIRING REAL LIVEKIT ---------------------------------------------------
 * 1. Server (token mint), when a logged-in user joins a room, stamp their Scute
 *    identity into the access token attributes:
 *
 *      new AccessToken(KEY, SECRET, { identity: user.id })
 *        .withAttributes({ scute_user_id: user.id, scute_roles: roles.join(","), scute_kind: "user" })
 *        .withGrants({ roomJoin: true, room })
 *
 * 2. Agent worker (livekit-agents): read ctx.participant.attributes and build
 *    the guarded tools with buildGuardedTools(...). Register the returned
 *    functions as the agent's @function_tool handlers. (Phone/SIP callers have
 *    no token, start anonymous, and bind identity mid-call via verify_caller.)
 * ---------------------------------------------------------------------------
 */
import {
  AgentGuard,
  ScuteVerifier,
  guardedLiveKitTool,
  identityFromLiveKitAttributes,
  maxAmount,
  type FetchLike,
  type Identity,
  type TraceSink,
} from "../src/index";

/** A fake customer-hosted order DB (the real tool would hit your backend). */
export function createOrderDb(): Record<number, { status: string; amount: number }> {
  return { 4471: { status: "paid", amount: 120 } };
}

export interface SupportAgentOptions {
  scuteBaseUrl: string;
  appId: string;
  fetchImpl?: FetchLike; // injectable for tests; defaults to global fetch
  sink?: TraceSink;
}

/** Build a guard wired to real Scute RBAC. */
export function buildGuard(opts: SupportAgentOptions): AgentGuard {
  return new AgentGuard({
    verifier: new ScuteVerifier({
      baseUrl: opts.scuteBaseUrl,
      appId: opts.appId,
      fetchImpl: opts.fetchImpl,
    }),
    sink: opts.sink,
  });
}

/**
 * Build the agent's guarded tools for a specific LiveKit participant. Each
 * returned fn is registered as a @function_tool handler; it gates via Scute for
 * that participant's identity and returns a ToolResponse the agent voices back.
 */
export function buildGuardedTools(
  guard: AgentGuard,
  participantAttributes: Record<string, string | undefined>,
  db: Record<number, { status: string; amount: number }>
) {
  // Prefer the user's Scute token (stamped into the join token as scute_token):
  // it lets the gate resolve permissions LIVE, so a permission granted mid-call
  // takes effect on the next tool call. Falls back to attribute-derived identity
  // (roles only, static) for setups that don't pass a token.
  const actor: string | Identity =
    participantAttributes.scute_token || identityFromLiveKitAttributes(participantAttributes);

  const lookupOrder = guardedLiveKitTool(guard, actor, {
    name: "lookup_order",
    permission: "orders:read",
    run: (args: { id: number }) => db[args.id] ?? null,
  });

  const refundOrder = guardedLiveKitTool(guard, actor, {
    name: "refund_order",
    permission: "orders:refund",
    layers: [maxAmount("amount", 500)], // args rung: cap refunds at $500
    run: (args: { id: number; amount?: number }) => {
      db[args.id].status = "refunded";
      return { id: args.id, status: "refunded" };
    },
  });

  return { lookupOrder, refundOrder };
}
