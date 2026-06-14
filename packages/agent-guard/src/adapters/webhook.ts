import { AgentGuard } from "../AgentGuard";
import { ANONYMOUS, GuardResult, Identity } from "../types";

/**
 * A provider-neutral tool call. Map your voice/agent provider's webhook payload
 * (Twilio, ElevenLabs, Vapi, etc.) into this shape, then run it through the gate
 * with handleToolCall. The mapping is trivial and version-specific per provider,
 * so it stays in your handler; the gate is the shared part.
 */
export interface ToolCall {
  toolName: string;
  args?: Record<string, unknown>;
  /** groups a voice/phone session; used for identity binding (verify_caller) and as the trace's sessionId */
  callId?: string;
  /** the provider's correlation id for this call; used as the trace id */
  toolCallId?: string;
}

export interface HandleOptions {
  /**
   * Explicit actor (e.g. a LiveKit token identity, or a token string). Falls
   * back to the call binding set by verify_caller, then to anonymous.
   */
  actor?: string | Identity;
}

/**
 * Run a parsed tool call through the gate. Identity precedence:
 * explicit actor -> call binding (verify_caller) -> anonymous.
 */
export async function handleToolCall(
  guard: AgentGuard,
  call: ToolCall,
  opts: HandleOptions = {}
): Promise<GuardResult> {
  const actor =
    opts.actor ??
    (call.callId ? guard.identityForCall(call.callId) : ANONYMOUS);
  return guard.run({
    actor,
    action: call.toolName,
    args: call.args,
    sessionId: call.callId,
    traceId: call.toolCallId,
  });
}

export interface ToolResponse {
  ok: boolean;
  decision: GuardResult["decision"];
  output?: unknown;
  message?: string;
}

/**
 * Map a guard decision to a provider-neutral tool response with a caller-facing
 * message. The agent speaks/returns `message` on a non-ok decision.
 */
export function toToolResponse(result: GuardResult): ToolResponse {
  switch (result.decision) {
    case "allowed":
      return { ok: true, decision: result.decision, output: result.result };
    case "allowed_downstream_error":
      return { ok: false, decision: result.decision, message: result.span.error || "The action failed to complete." };
    case "needs_challenge":
      return { ok: false, decision: result.decision, message: `I need to verify you first (${result.challenge?.method ?? "otp"}) before doing that.` };
    case "approval_required":
      return { ok: false, decision: result.decision, message: "That action needs approval. I will get it approved and follow up." };
    case "blocked_rbac":
      return { ok: false, decision: result.decision, message: "You are not permitted to do that." };
    case "blocked_no_rule":
      return { ok: false, decision: result.decision, message: "That action is not available." };
    default:
      return { ok: false, decision: result.decision };
  }
}
