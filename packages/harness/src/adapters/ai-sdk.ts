import { rank, runs } from "../decisions";
import type { Run } from "../run";
import type { Args, GuardResult, Verdict } from "../types";

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

const isAsyncGeneratorFunction = (fn: unknown): boolean =>
  typeof fn === "function" && Object.prototype.toString.call(fn) === "[object AsyncGeneratorFunction]";

/** An enforced after-guard replaced the result with an error (guide, redirect, deny, or a guard that failed). */
const withheld = (results: GuardResult[]) => results.some((r) => r.mode === "enforce" && rank(r.decision.kind) >= rank("guide"));

/**
 * A streaming tool's parts, each through the after-guards before it leaves.
 * In the AI SDK every yielded value is a whole preliminary output (the last
 * one is what the model reads), not a delta, so each is guarded as a result
 * of its own: redacted where needed, and when one is withheld the stream
 * ends there, with the withheld notice as the final output.
 */
async function* guardedStream(source: AsyncIterable<unknown>, guard: (part: unknown) => Promise<{ result: unknown; results: GuardResult[] }>) {
  const iterator = source[Symbol.asyncIterator]();
  let finished = false;
  try {
    while (true) {
      const next = await iterator.next();
      if (next.done) {
        finished = true;
        return;
      }
      const { result, results } = await guard(next.value);
      yield result;
      if (withheld(results)) return;
    }
  } finally {
    // Stopped early (withheld, or the consumer quit): let the tool clean up.
    if (!finished) await iterator.return?.();
  }
}

export function aiSdkTools<T extends Record<string, any>>(run: Run, tools: T): T {
  const out: Record<string, any> = {};
  for (const [name, tool] of Object.entries(tools)) {
    if (!tool || typeof tool.execute !== "function") {
      out[name] = tool;
      continue;
    }
    const execute = tool.execute as (input: unknown, options: ExecuteOptions) => unknown;
    const opts = (options: ExecuteOptions) => ({
      id: options.toolCallId,
      messages: options.messages ?? [],
      approvedByUser: userApproved(options.messages, options.toolCallId),
    });
    const verdictFor = async (input: Record<string, unknown>, options: ExecuteOptions) =>
      run.take(options.toolCallId, name, input) ?? (await run.check(name, input, opts(options)));
    const refusal = (verdict: Verdict) => ({ error: verdict.message, decision: verdict.kind, reason: verdict.decision.reason });
    const guardPart = (args: Args, options: ExecuteOptions) => (part: unknown) => run.after(name, args, part, opts(options));

    out[name] = {
      ...tool,
      // The SDK streams only when execute itself returns an async iterable
      // (a Promise of one is a final output), so a streaming tool keeps a
      // generator for an execute: every part goes through the after-guards.
      execute: isAsyncGeneratorFunction(execute)
        ? async function* (input: Record<string, unknown>, options: ExecuteOptions = {}) {
            const verdict = await verdictFor(input, options);
            if (!runs(verdict)) {
              yield refusal(verdict);
              return;
            }
            yield* guardedStream(execute(verdict.args, options) as AsyncIterable<unknown>, guardPart(verdict.args, options));
          }
        : async (input: Record<string, unknown>, options: ExecuteOptions = {}) => {
            const verdict = await verdictFor(input, options);
            if (!runs(verdict)) return refusal(verdict);
            const result = await execute(verdict.args, options);
            // An iterable behind a Promise can't stream: the model gets the last part, guarded like every one before it.
            if (isAsyncIterable(result)) {
              let last: unknown;
              for await (const part of guardedStream(result, guardPart(verdict.args, options))) last = part;
              return last;
            }
            return (await run.after(name, verdict.args, result, opts(options))).result;
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
    const needsApproval = await toolNeedsApproval(options.tools?.[toolCall.toolName], input, {
      toolCallId: toolCall.toolCallId,
      messages: options.messages,
    });
    // A call the person still has to approve isn't charged here: execute
    // checks it again once they have (often in a later request), and that
    // check is the one that counts toward budgets.
    const verdict = await run.check(toolCall.toolName, input, {
      id: toolCall.toolCallId,
      messages: options.messages ?? [],
      reserve: !needsApproval,
    });
    switch (verdict.kind) {
      case "proceed":
      case "transform":
        if (needsApproval) return { type: "user-approval" };
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
