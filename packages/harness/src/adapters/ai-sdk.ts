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
        const verdict = run.take(options.toolCallId) ?? (await run.check(name, input, opts));
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

export function aiSdkToolApproval(run: Run) {
  return async (options: {
    toolCall: { toolName: string; toolCallId: string; input: unknown };
    messages?: unknown[];
  }): Promise<AiSdkApprovalStatus> => {
    const { toolCall } = options;
    const verdict = await run.check(toolCall.toolName, (toolCall.input ?? {}) as Record<string, unknown>, {
      id: toolCall.toolCallId,
      messages: options.messages ?? [],
    });
    switch (verdict.kind) {
      case "proceed":
      case "transform":
        run.keep(verdict);
        return undefined;
      case "verify":
        return { type: "user-approval", reason: verdict.decision.message ?? verdict.message };
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
