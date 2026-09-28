import { ScuteHarnessError } from "../client";
import type { Run } from "../run";

/** `jsonSchema` from the "ai" package (or anything that turns JSON Schema into your framework's schema). */
export type JsonSchemaFn = (schema: Record<string, unknown>) => any;

export const HUMAN_TOOLS = ["scute_verify_person", "scute_submit_code", "scute_check_verification", "scute_approval_status", "scute_whoami"];

const METHOD_HELP: Record<string, string> = {
  email_otp: "a code by email",
  sms_otp: "a code by text message",
  totp: "the code in their authenticator app",
  backup_code: "one of their backup codes",
  entra_push: "a Microsoft Authenticator request",
  push: "a request on their phone",
};

async function answer<T>(fn: () => Promise<T>, pick: (v: T) => Record<string, unknown>) {
  try {
    return pick(await fn());
  } catch (e) {
    if (e instanceof ScuteHarnessError && e.code === "method_required") {
      return { error: "method_required", say: "How would you like to verify: a code by email or text, or your authenticator app?" };
    }
    if (e instanceof ScuteHarnessError && e.code === "no_challenge") {
      return { error: "no_verification", say: "Let me send you a verification first." };
    }
    const body = e instanceof ScuteHarnessError ? (e.body as { say?: string } | undefined) : undefined;
    return { error: e instanceof Error ? e.message : String(e), ...(body?.say ? { say: body.say } : {}) };
  }
}

const verification = (v: { status: string; say: string; remaining_attempts?: number }) => ({
  status: v.status,
  say: v.say,
  ...(v.remaining_attempts !== undefined && v.status === "pending" ? { remaining_attempts: v.remaining_attempts } : {}),
});

/**
 * Tools the model calls to bring the person in: verify them (a code or a
 * push), pass on the code they read out, check a push, check an approval,
 * and ask what the task allows. Every answer has a `say` line.
 *
 * ```ts
 * import { jsonSchema } from "ai";
 * tools: { ...run.tools(myTools), ...run.humanTools(jsonSchema) }
 * ```
 */
export function humanTools(run: Run, jsonSchema: JsonSchemaFn, options: { methods?: string[] } = {}) {
  const methods = options.methods ?? ["email_otp", "sms_otp", "totp", "entra_push"];
  run.humanToolNames = HUMAN_TOOLS;

  return {
    scute_verify_person: {
      description:
        "Verify that the person you're helping is who they say they are. Use it when an action needs verification. " +
        "It sends them a code or a request; tell them the `say` line.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          method: {
            type: "string",
            enum: methods,
            description: `How to verify: ${methods.map((m) => `${m} = ${METHOD_HELP[m] ?? m}`).join("; ")}.`,
          },
        },
        additionalProperties: false,
      }),
      execute: (input: { method?: string }) => answer(() => run.startVerification({ method: input?.method }), verification),
    },
    scute_submit_code: {
      description: "Pass on the verification code the person read out to you.",
      inputSchema: jsonSchema({
        type: "object",
        properties: { code: { type: "string", description: "The code, digits only." } },
        required: ["code"],
        additionalProperties: false,
      }),
      execute: (input: { code: string }) => answer(() => run.submitCode(String(input.code).replace(/\s+/g, "")), verification),
    },
    scute_check_verification: {
      description: "Check whether the person finished verifying (for a push or a link). Tell them the `say` line.",
      inputSchema: jsonSchema({ type: "object", properties: {}, additionalProperties: false }),
      execute: () => answer(() => run.verificationStatus(), verification),
    },
    scute_approval_status: {
      description: "Check whether a reviewer answered an approval request. Tell the person the `say` line.",
      inputSchema: jsonSchema({
        type: "object",
        properties: { id: { type: "string", description: "The approval request id." } },
        required: ["id"],
        additionalProperties: false,
      }),
      execute: (input: { id: string }) =>
        answer(() => run.approvalStatus(input.id), (a) => ({ status: a.status, say: a.say })),
    },
    scute_whoami: {
      description: "Who you're working for in this task, what you may do, and how long the task has left.",
      inputSchema: jsonSchema({ type: "object", properties: {}, additionalProperties: false }),
      execute: () =>
        answer(
          () => run.whoami(),
          (w) => ({
            acts_for: w.acts_for,
            may: w.permissions,
            could_with_more_access: w.ceiling.filter((p) => !w.permissions.includes(p)),
            needs_verification: w.step_up,
            needs_approval: w.approval,
            expires_in: w.expires_in,
            warnings: w.warnings,
          })
        ),
    },
  };
}
