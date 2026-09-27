import { generateText, isStepCount, tool, type ModelMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createHarness, guards, memoryStore, userApproved } from "../index";
import { base, fakeScute } from "./fake-scute";

// The real AI SDK v7 loop with a scripted model: the adapter has to work
// through toolApproval, execute and approval responses as the SDK runs them.

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

const callTool = (toolName: string, input: unknown, toolCallId = "call1") => ({
  content: [{ type: "tool-call" as const, toolCallId, toolName, input: JSON.stringify(input) }],
  finishReason: { unified: "tool-calls" as const, raw: undefined },
  usage,
  warnings: [],
});

const say = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: undefined },
  usage,
  warnings: [],
});

function invoiceTools() {
  const refund = vi.fn(async ({ invoice_id, amount }: { invoice_id: string; amount: number }) => ({ refunded: invoice_id, amount }));
  const read = vi.fn(async ({ invoice_id }: { invoice_id: string }) => ({ id: invoice_id, total: 90 }));
  return {
    refund,
    read,
    tools: {
      refund_invoice: tool({ description: "Refund", inputSchema: z.object({ invoice_id: z.string(), amount: z.number() }), execute: refund }),
      read_invoice: tool({ description: "Read", inputSchema: z.object({ invoice_id: z.string() }), execute: read }),
    },
  };
}

const prompt = (m: MockLanguageModelV4, i: number) => JSON.stringify(m.doGenerateCalls[i].prompt);

describe("Vercel AI SDK v7", () => {
  it("runs an allowed call once, checking it once", async () => {
    const scute = fakeScute();
    const run = createHarness({ ...base, fetch: scute.fetch }).run({ actsFor: "user1" });
    const { tools, read } = invoiceTools();
    const model = new MockLanguageModelV4({ doGenerate: [callTool("read_invoice", { invoice_id: "INV-1" }), say("It's 90.")] });

    const result = await generateText({
      model,
      prompt: "What's on INV-1?",
      tools: run.tools(tools),
      toolApproval: run.toolApproval,
      stopWhen: isStepCount(5),
    });

    expect(result.text).toBe("It's 90.");
    expect(read).toHaveBeenCalledTimes(1);
    expect(scute.paths("/v1/auth/app1/agent/check")).toHaveLength(1); // toolApproval's verdict was reused by execute
  });

  it("denies with the reason the model reads, and never runs the tool", async () => {
    const scute = fakeScute({
      decide: () => ({ decision: "deny", reason: "outside_task", explanation: "This task doesn't cover refund invoice INV-1 (T-9)." }),
    });
    const run = createHarness({ ...base, fetch: scute.fetch }).run({ actsFor: "user1" });
    const { tools, refund } = invoiceTools();
    const model = new MockLanguageModelV4({ doGenerate: [callTool("refund_invoice", { invoice_id: "INV-1", amount: 5 }), say("I can't.")] });

    await generateText({ model, prompt: "refund", tools: run.tools(tools), toolApproval: run.toolApproval, stopWhen: isStepCount(5) });

    expect(refund).not.toHaveBeenCalled();
    expect(prompt(model, 1)).toContain("Not allowed: This task doesn't cover refund invoice INV-1 (T-9).");
  });

  it("asks the person, then runs once they approve (across two requests)", async () => {
    const store = memoryStore();
    const harness = createHarness({
      ...base,
      fetch: fakeScute().fetch,
      store,
      tools: { refund_invoice: { tier: "high" } },
      guards: [guards.permissions(), guards.approval()],
    });
    const { tools, refund } = invoiceTools();

    // Request 1: the SDK stops on the approval request.
    const run1 = harness.run({ id: "chat-9", actsFor: "user1" });
    const model1 = new MockLanguageModelV4({ doGenerate: [callTool("refund_invoice", { invoice_id: "INV-1", amount: 90 })] });
    const first = await generateText({
      model: model1,
      prompt: "Refund INV-1, 90",
      tools: run1.tools(tools),
      toolApproval: run1.toolApproval,
      stopWhen: isStepCount(5),
    });
    const request = first.content.find((p) => p.type === "tool-approval-request") as { approvalId: string; reason?: string } | undefined;
    expect(request?.reason).toBe("Confirm: refund_invoice (invoice_id INV-1, amount 90)");
    expect(refund).not.toHaveBeenCalled();

    // Request 2: the person approved in the UI.
    const messages: ModelMessage[] = [
      { role: "user", content: "Refund INV-1, 90" },
      ...first.response.messages,
      { role: "tool", content: [{ type: "tool-approval-response", approvalId: request!.approvalId, approved: true }] },
    ];
    expect(userApproved(messages, "call1")).toBe(true);
    const run2 = harness.run({ id: "chat-9", actsFor: "user1" });
    const model2 = new MockLanguageModelV4({ doGenerate: [say("Refunded.")] });
    const second = await generateText({ model: model2, messages, tools: run2.tools(tools), toolApproval: run2.toolApproval, stopWhen: isStepCount(5) });

    expect(refund).toHaveBeenCalledTimes(1);
    expect(second.text).toBe("Refunded.");
  });

  it("won't run a call the person declined", async () => {
    const harness = createHarness({ ...base, fetch: fakeScute().fetch, tools: { refund_invoice: { tier: "high" } }, guards: [guards.approval()] });
    const { tools, refund } = invoiceTools();
    const run = harness.run();
    const first = await generateText({
      model: new MockLanguageModelV4({ doGenerate: [callTool("refund_invoice", { invoice_id: "INV-1", amount: 90 })] }),
      prompt: "refund",
      tools: run.tools(tools),
      toolApproval: run.toolApproval,
    });
    const request = first.content.find((p) => p.type === "tool-approval-request") as { approvalId: string };
    const messages: ModelMessage[] = [
      { role: "user", content: "refund" },
      ...first.response.messages,
      { role: "tool", content: [{ type: "tool-approval-response", approvalId: request.approvalId, approved: false }] },
    ];
    expect(userApproved(messages, "call1")).toBe(false);
    await generateText({
      model: new MockLanguageModelV4({ doGenerate: [say("OK, not refunding.")] }),
      messages,
      tools: run.tools(tools),
      toolApproval: run.toolApproval,
    });
    expect(refund).not.toHaveBeenCalled();
  });

  it("guides an ungrounded argument back to the person", async () => {
    const run = createHarness({ ...base, fetch: fakeScute().fetch, guards: [guards.grounding()] }).run();
    const { tools, refund } = invoiceTools();
    const model = new MockLanguageModelV4({
      doGenerate: [callTool("refund_invoice", { invoice_id: "INV-4242", amount: 90 }), say("Which invoice?")],
    });

    await generateText({ model, prompt: "Refund my last invoice, 90 euros", tools: run.tools(tools), toolApproval: run.toolApproval, stopWhen: isStepCount(5) });

    expect(refund).not.toHaveBeenCalled();
    expect(prompt(model, 1)).toContain("Don't guess invoice_id");
  });

  it("redacts results before the model sees them", async () => {
    const run = createHarness({ ...base, fetch: fakeScute().fetch, guards: [guards.content({ pii: ["card"] })] }).run();
    const lookup = tool({
      description: "Look up",
      inputSchema: z.object({ id: z.string() }),
      execute: async () => ({ card: "4242 4242 4242 4242" }),
    });
    const model = new MockLanguageModelV4({ doGenerate: [callTool("lookup_customer", { id: "c1" }), say("done")] });

    await generateText({ model, prompt: "look up c1", tools: run.tools({ lookup_customer: lookup }), toolApproval: run.toolApproval, stopWhen: isStepCount(5) });

    expect(prompt(model, 1)).toContain("[card removed]");
    expect(prompt(model, 1)).not.toContain("4242 4242");
  });

  it("stops the loop when the budget is spent, and hides tools outside the ceiling", async () => {
    const run = createHarness({ ...base, fetch: fakeScute({ ceiling: ["invoice:read"] }).fetch, guards: [guards.budget({ calls: 1 })] }).run({
      actsFor: "user1",
    });
    const { tools, read } = invoiceTools();
    const model = new MockLanguageModelV4({
      doGenerate: [callTool("read_invoice", { invoice_id: "A" }, "c1"), callTool("read_invoice", { invoice_id: "B" }, "c2"), say("x")],
    });

    const result = await generateText({
      model,
      prompt: "read both",
      tools: run.tools(tools),
      toolApproval: run.toolApproval,
      prepareStep: run.prepareStep,
      stopWhen: [isStepCount(5), run.budgetExceeded],
    });

    expect(read).toHaveBeenCalledTimes(1);
    expect(result.steps).toHaveLength(1);
    expect((model.doGenerateCalls[0].tools ?? []).map((t: { name: string }) => t.name)).toEqual(["read_invoice"]);
  });
});

describe("human tools in the AI SDK loop", () => {
  it("lets the model verify the person itself, then do the action", async () => {
    const { jsonSchema } = await import("ai");
    const scute = fakeScute({
      decide: (body) =>
        body.challenge === "ch_ok"
          ? { decision: "allow" }
          : { decision: "allow_with_step_up", step_up: { method: "any", authorizes_action: "invoice:refund" }, explanation: "Refunds need a fresh verification." },
    });
    const run = createHarness({ ...base, fetch: scute.fetch }).run({ actsFor: "user1" });
    const { tools, refund } = invoiceTools();
    const model = new MockLanguageModelV4({
      doGenerate: [
        callTool("refund_invoice", { invoice_id: "INV-1", amount: 90 }, "c1"),
        callTool("scute_verify_person", { method: "email_otp" }, "c2"),
        callTool("scute_submit_code", { code: "123 456" }, "c3"),
        callTool("refund_invoice", { invoice_id: "INV-1", amount: 90 }, "c4"),
        say("Done, refunded."),
      ],
    });

    const result = await generateText({
      model,
      prompt: "Refund INV-1, 90",
      tools: { ...run.tools(tools), ...run.humanTools(jsonSchema) },
      toolApproval: run.toolApproval,
      prepareStep: run.prepareStep,
      stopWhen: isStepCount(10),
    });

    expect(result.text).toBe("Done, refunded.");
    expect(refund).toHaveBeenCalledTimes(1);
    expect(prompt(model, 1)).toContain("Verify them with scute_verify_person, then try again.");
    expect(prompt(model, 2)).toContain("I've emailed a code to a***@example.com. What's the code?");
    expect(prompt(model, 3)).toContain("Thanks, you're verified.");
    expect(scute.paths("/v1/auth/app1/agent/verifications")[0].body).toMatchObject({ method: "email_otp", permission: "invoice:refund" });
    expect((model.doGenerateCalls[0].tools ?? []).map((t: { name: string }) => t.name)).toEqual(
      expect.arrayContaining(["refund_invoice", "scute_verify_person", "scute_submit_code", "scute_whoami"])
    );
  });

  it("answers the model plainly when something is missing", async () => {
    const { jsonSchema } = await import("ai");
    const run = createHarness({ ...base, fetch: fakeScute().fetch }).run({ actsFor: "user1" });
    const t = run.humanTools((s) => jsonSchema(s));

    expect(await t.scute_submit_code.execute({ code: "1" })).toEqual({ error: "no_verification", say: "Let me send you a verification first." });
    expect(await t.scute_verify_person.execute({})).toMatchObject({ error: "method_required" });
    expect(await t.scute_whoami.execute()).toMatchObject({ acts_for: "user1", could_with_more_access: ["invoice:read", "invoice:refund"] });
  });
});
