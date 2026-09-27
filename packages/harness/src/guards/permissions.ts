import type { Decision, EngineDecision, Guard, Mode, ToolCall } from "../types";

export type PermissionsOptions = {
  mode?: Mode;
  /** File an access request when a reviewer has to approve (default true, enforce mode only). */
  fileRequests?: boolean;
  /** Extra `context.*` for policy conditions, per call. */
  context?: (call: ToolCall) => Record<string, unknown> | undefined;
};

function fromEngine(engine: EngineDecision): Decision {
  switch (engine.decision) {
    case "allow":
      return { kind: "proceed", reason: engine.reason, engine };
    case "allow_with_step_up":
      return {
        kind: "verify",
        reason: engine.reason,
        message: engine.explanation,
        verify: { method: engine.step_up?.method, permission: engine.step_up?.authorizes_action ?? engine.permission },
        engine,
      };
    case "allow_with_approval":
      return { kind: "approve", reason: engine.reason, message: engine.explanation, approve: { by: "reviewer" }, engine };
    default:
      return { kind: "deny", reason: engine.reason, message: engine.explanation, engine };
  }
}

/**
 * Scute's engine decides: the agent's roles, the person it works for
 * (object roles, conditions, verification, approvals) and the task, all
 * three. Tools with no permission (`tools: { name: false }`) pass through.
 */
export function permissions(options: PermissionsOptions = {}): Guard {
  return {
    name: "permissions",
    mode: options.mode,
    async before(call) {
      if (!call.permission || !call.spec.action) return;
      const context = options.context?.(call);
      let engine = await call.run.engineCheck(call, context);
      if (engine.decision !== "allow_with_approval") return fromEngine(engine);

      if (options.fileRequests === false || call.mode !== "enforce") return fromEngine(engine);
      const request = await call.run.requestApproval(call);
      // Approved since the last try: check again with it, which spends it.
      if (request?.status === "approved") engine = await call.run.engineCheck(call, context);
      const decision = fromEngine(engine);
      if (decision.approve && request) decision.approve.requestId = request.id;
      return decision;
    },
  };
}
