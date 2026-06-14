/**
 * Example: phone voice agent (Twilio / ElevenLabs / Vapi) guarded by Scute.
 *
 * Phone callers have no login token, so they start ANONYMOUS and bind their
 * identity mid-call via verify_caller (a Scute OTP/challenge). After that, tool
 * calls authorize as them. Each provider posts tool calls to your webhook in a
 * slightly different shape — map it to a ToolCall, then the gate is identical.
 *
 * Run the flow (no provider/Scute needed):
 *   pnpm --filter @scute/agent-guard test phone-example
 */
import {
  AgentGuard,
  handleToolCall,
  toToolResponse,
  type ToolCall,
  type Identity,
  type ToolResponse,
} from "../src/index";

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// --- provider webhook body -> ToolCall (best-effort; adjust to your version) ---

export function parseElevenLabsWebhook(body: any): ToolCall | null {
  if (!body || (!body.tool_name && !body.name)) return null;
  return {
    toolName: body.tool_name ?? body.name,
    args: body.parameters ?? body.args ?? {},
    callId: body.conversation_id ?? body.call_id,
    toolCallId: body.tool_call_id,
  };
}

export function parseVapiWebhook(body: any): ToolCall | null {
  const tc = body?.message?.toolCalls?.[0] ?? body?.message?.tool_calls?.[0];
  if (!tc?.function) return null;
  const fn = tc.function;
  return {
    toolName: fn.name,
    args: typeof fn.arguments === "string" ? safeJson(fn.arguments) : fn.arguments ?? {},
    callId: body?.call?.id ?? body?.message?.call?.id,
    toolCallId: tc.id,
  };
}

export function parseTwilioWebhook(body: any): ToolCall | null {
  if (!body || (!body.tool && !body.FunctionName)) return null;
  return {
    toolName: body.tool ?? body.FunctionName,
    args: body.args ?? body.parameters ?? {},
    callId: body.CallSid ?? body.call_id,
    toolCallId: body.tool_call_id,
  };
}

// Gate a parsed tool call. Identity resolves from the call binding (set by
// verify_caller) or anonymous until the caller is verified.
export async function runPhoneTool(guard: AgentGuard, call: ToolCall): Promise<ToolResponse> {
  return toToolResponse(await handleToolCall(guard, call));
}

// verify_caller: after the caller proves identity (in production this is a Scute
// OTP / challenge keyed to their phone), bind the call so later tool calls
// authorize as them.
export function bindVerifiedCaller(guard: AgentGuard, callId: string, identity: Identity): void {
  guard.bindCall(callId, identity);
}
