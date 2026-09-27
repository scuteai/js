import { runs } from "../decisions";
import type { Run } from "../run";

// Vercel AI SDK v7, structurally: no dependency on the `ai` package.

export type AiSdkApprovalStatus =
  | undefined
  | "not-applicable"
  | "approved"
  | "denied"
  | "user-approval"
  | { type: "approved" | "denied" | "user-approval"; reason?: string };

type ExecuteOptions = { toolCallId?: string; messages?: unknown[]; [key: string]: unknown };

/** Did the person approve this tool call (a tool-approval-response for its approval request)? */
export function userApproved(messages: unknown[] | undefined, toolCallId: string | undefined): boolean {
  if (!messages?.length || !toolCallId) return false;
  const parts = messages.flatMap((m) => {
    const content = (m as { content?: unknown })?.content;
    return Array.isArray(content) ? content : [];
  }) as { type?: string; approvalId?: string; toolCallId?: string; approved?: boolean }[];
  const approvalIds = parts.filter((p) => p?.type === "tool-approval-request" && p.toolCallId === toolCallId).map((p) => p.approvalId);
  return parts.some((p) => p?.type === "tool-approval-response" && p.approved === true && approvalIds.includes(p.approvalId));
}

const isAsyncIterable = (v: unknown): v is AsyncIterable<unknown> =>
  !!v && typeof (v as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function";

export function aiSdkTools<T extends Record<string, any>>(run: Run, tools: T): T {
  const out: Record<string, any> = {};
  for (const [name, tool] of Object.entries(tools)) {
    if (!tool || typeof tool.execute !== "function") {
      out[name] = tool;
      continue;
    }
    const execute = tool.execute as (input: unknown, options: ExecuteOptions) => unknown;
    out[name] = {
      ...tool,
      execute: async (input: Record<string, unknown>, options: ExecuteOptions = {}) => {
        const opts = {
          id: options.toolCallId,
          messages: options.messages ?? [],
          approvedByUser: userApproved(options.messages, options.toolCallId),
        };
        const verdict = run.take(options.toolCallId, name, input) ?? (await run.check(name, input, opts));
        if (!runs(verdict)) return { error: verdict.message, decision: verdict.kind, reason: verdict.decision.reason };
        const result = await execute(verdict.args, options);
        // Streaming tools: counted, but their parts reach the model as they come.
        if (isAsyncIterable(result)) {
          await run.after(name, verdict.args, undefined, opts);
          return result;
        }
        return (await run.after(name, verdict.args, result, opts)).result;
      },
    };
  }
  run.toolNames = Array.from(new Set([...run.toolNames, ...Object.keys(out)]));
  return out as T;
}

/**
 * A tool's own `needsApproval` (deprecated in v7, still honored by us): a
 * generic `toolApproval` function replaces the SDK's own reading of it, so
 * the harness has to ask it on the tool's behalf.
 */
async function toolNeedsApproval(
  tool: unknown,
  input: unknown,
  options: { toolCallId: string; messages?: unknown[] }
): Promise<boolean> {
  const needs = (tool as { needsApproval?: unknown } | undefined)?.needsApproval;
  if (typeof needs === "function") return !!(await needs(input, { toolCallId: options.toolCallId, messages: options.messages ?? [] }));
  return needs === true;
}

export function aiSdkToolApproval(run: Run) {
  return async (options: {
    toolCall: { toolName: string; toolCallId: string; input: unknown };
    tools?: Record<string, unknown>;
    messages?: unknown[];
  }): Promise<AiSdkApprovalStatus> => {
    const { toolCall } = options;
    // The harness's own tools for human steps aren't actions to guard.
    if (run.humanToolNames.includes(toolCall.toolName)) return undefined;
    const input = (toolCall.input ?? {}) as Record<string, unknown>;
    const verdict = await run.check(toolCall.toolName, input, { id: toolCall.toolCallId, messages: options.messages ?? [] });
    switch (verdict.kind) {
      case "proceed":
      case "transform":
        if (await toolNeedsApproval(options.tools?.[toolCall.toolName], input, { toolCallId: toolCall.toolCallId, messages: options.messages })) {
          return { type: "user-approval" };
        }
        run.keep(verdict, input);
        return undefined;
      case "verify":
        // With the human tools, the model verifies the person itself.
        return run.humanToolNames.length
          ? { type: "denied", reason: verdict.message }
          : { type: "user-approval", reason: verdict.decision.message ?? verdict.message };
      case "approve":
        return verdict.decision.approve?.by === "reviewer"
          ? { type: "denied", reason: verdict.message }
          : { type: "user-approval", reason: verdict.decision.message ?? verdict.message };
      default:
        return { type: "denied", reason: verdict.message };
    }
  };
}

export function aiSdkPrepareStep(run: Run) {
  // `any`: the SDK types activeTools as the union of your tool names, which the harness can't know.
  return async (_options?: unknown): Promise<{ activeTools: any }> => ({ activeTools: await run.allowedTools() });
}
