import { describe, expect, it, vi } from "vitest";
import { createHarness, guards, memoryStore, toolPermission, type DecisionEvent } from "../index";
import { base, fakeScute } from "./fake-scute";

const CHECK = "/v1/auth/app1/agent/check";
const MINT = "/v1/apps/app1/authz/agents/support-bot/tasks";

describe("naming convention", () => {
  it("maps tool names to permissions", () => {
    expect(toolPermission("refund_invoice")).toBe("invoice:refund");
    expect(toolPermission("resetUserMfa")).toBe("user_mfa:reset");
    expect(toolPermission("lookup-invoice")).toBe("invoice:lookup");
    expect(toolPermission("search")).toBe("search");
  });

  it("finds the object in the arguments, and never takes its attributes from them", () => {
    const h = createHarness({ ...base, fetch: fakeScute().fetch });
    expect(h.spec("refund_invoice").resource({ invoice_id: 42, amount: 90, note: { x: 1 } })).toEqual({ type: "invoice", key: "42" });
    expect(h.spec("reset_user_mfa").resource({ userMfaId: "u1" })).toEqual({ type: "user_mfa", key: "u1" });
    expect(h.spec("read_invoice").resource({ id: "7" })).toEqual({ type: "invoice", key: "7" });
  });

  it("takes overrides per tool", () => {
    const h = createHarness({
      ...base,
      fetch: fakeScute().fetch,
      tools: {
        send_money: { permission: "payment:create", tier: "high", key: "to", attributes: (a) => ({ currency: a.currency }) },
        get_weather: false,
      },
    });
    expect(h.spec("send_money")).toMatchObject({ permission: "payment:create", action: "create", resourceType: "payment", tier: "high" });
    expect(h.spec("send_money").resource({ to: "acct9", amount: 5, currency: "EUR" })).toEqual({
      type: "payment",
      key: "acct9",
      attributes: { currency: "EUR" },
    });
    expect(h.spec("get_weather").permission).toBeNull();
  });
});

describe("permissions guard", () => {
  it("starts the task once, lazily, and asks the engine with the action and object", async () => {
    const scute = fakeScute();
    const run = createHarness({ ...base, fetch: scute.fetch }).run({ actsFor: "user1", task: { actions: ["invoice:refund"], ref: "T-9" } });

    const [a, b] = await Promise.all([run.check("refund_invoice", { invoice_id: 42, amount: 90 }), run.check("read_invoice", { id: 1 })]);

    expect(a.kind).toBe("proceed");
    expect(b.kind).toBe("proceed");
    expect(scute.paths(MINT)).toHaveLength(1);
    expect(scute.paths(MINT)[0].body).toMatchObject({ acts_for: "user1", actions: ["invoice:refund"], ref: "T-9" });
    const refund = scute.paths(CHECK).find((c) => c.body.action === "refund")!;
    expect(refund).toMatchObject({
      auth: "Bearer sct_token1",
      body: { action: "refund", resource: { type: "invoice", key: "42" }, context: { args: { invoice_id: 42, amount: 90 } } },
    });
    expect(refund.body.resource).not.toHaveProperty("attributes");
  });

  it("maps engine answers to decisions and tells the model what to do", async () => {
    const answers: Record<string, any> = {
      delete: { decision: "deny", reason: "agent_role", explanation: "Support bot can't delete invoice 1: none of its roles allow it." },
      pay: { decision: "allow_with_step_up", reason: "verification_required", step_up: { method: "entra_push", authorizes_action: "invoice:pay" } },
    };
    const scute = fakeScute({ decide: (body) => answers[body.action] ?? { decision: "allow" } });
    const run = createHarness({ ...base, fetch: scute.fetch }).run({ actsFor: "user1" });

    const denied = await run.check("delete_invoice", { id: 1 });
    expect(denied).toMatchObject({ kind: "deny", decision: { reason: "agent_role", guard: "permissions" } });
    expect(denied.message).toBe("Not allowed: Support bot can't delete invoice 1: none of its roles allow it. Don't retry it; tell the person.");

    const verify = await run.check("pay_invoice", { id: 1 });
    expect(verify).toMatchObject({ kind: "verify", decision: { verify: { method: "entra_push", permission: "invoice:pay" } } });
  });

  it("skips tools with no permission", async () => {
    const scute = fakeScute();
    const run = createHarness({ ...base, fetch: scute.fetch, tools: { get_weather: false } }).run({ actsFor: "user1" });

    expect((await run.check("get_weather", { city: "Oslo" })).kind).toBe("proceed");
    expect(scute.seen).toHaveLength(0);
  });

  it("fails closed when Scute can't be reached", async () => {
    const run = createHarness({
      ...base,
      fetch: (async () => {
        throw new Error("ECONNREFUSED");
      }) as any,
    }).run({ actsFor: "user1" });

    const v = await run.check("refund_invoice", { id: 1 });
    expect(v).toMatchObject({ kind: "deny", decision: { reason: "guard_error" } });
    expect(v.results[0].error).toBeInstanceOf(Error);
  });

  it("verifies the person with the task token and carries the proof into the next check", async () => {
    const scute = fakeScute({
      decide: (body) =>
        body.challenge === "ch_ok"
          ? { decision: "allow" }
          : {
              decision: "allow_with_step_up",
              say: "Before I do that, I need to verify it's you.",
              step_up: { method: "any", authorizes_action: "invoice:pay" },
            },
    });
    const run = createHarness({ agent: "support-bot", appId: "app1", baseUrl: "https://scute.test", fetch: scute.fetch }).run({
      token: "sct_from_backend",
    });

    const first = await run.check("pay_invoice", { id: 1 });
    expect(first).toMatchObject({ kind: "verify", say: "Before I do that, I need to verify it's you." });
    await expect(run.startVerification({ verdict: first })).rejects.toThrow(/Pick a verification method/);

    const started = await run.startVerification({ method: "email_otp" }); // binds to the verdict that asked
    expect(started.say).toBe("I've emailed a code to a***@example.com. What's the code?");
    expect(scute.paths("/v1/auth/app1/agent/verifications")[0]).toMatchObject({
      auth: "Bearer sct_from_backend",
      body: { method: "email_otp", permission: "invoice:pay", session_id: "sess1" },
    });

    const wrong = await run.submitCode("000000");
    expect(wrong).toMatchObject({ status: "pending", remaining_attempts: 2, say: "That code didn't work. Want to try again?" });
    expect(await run.verifiedAt()).toBeUndefined();

    expect((await run.submitCode("123456")).status).toBe("completed");
    expect(await run.verifiedAt()).toBeGreaterThan(0);

    expect((await run.check("pay_invoice", { id: 1 })).kind).toBe("proceed");
    expect(scute.paths(CHECK).at(-1)!.body).toMatchObject({ challenge: "ch_ok", session_id: "sess1" });
  });

  it("records a push once it's approved", async () => {
    const scute = fakeScute();
    const run = createHarness({ ...base, fetch: scute.fetch }).run({ actsFor: "user1" });
    await run.startVerification({ method: "entra_push", permission: "invoice:pay" });

    await expect(run.completeVerification()).rejects.toThrow(/Not verified yet \(pending\)/);
    scute.state.verificationStatus = "completed";
    await run.completeVerification();
    expect((await run.snapshot()).challenges).toEqual({ "invoice:pay": "ch_ok" });
  });

  it("rejects a verification Scute doesn't accept", async () => {
    const run = createHarness({ ...base, fetch: fakeScute().fetch }).run({ actsFor: "user1" });
    await expect(run.completeVerification("ch_forged")).rejects.toThrow(/doesn't verify this person/);
    expect(await run.verifiedAt()).toBeUndefined();
  });

  it("files the reviewer approval once and goes through once it's approved", async () => {
    const scute = fakeScute({
      decide: (body) => (body.approval && scute.state.requestStatus === "approved" ? { decision: "allow" } : { decision: "allow_with_approval", explanation: "Needs a reviewer." }),
    });
    const run = createHarness({ ...base, fetch: scute.fetch }).run({ actsFor: "user1" });

    const pending = await run.check("refund_invoice", { invoice_id: 42, amount: 900 });
    expect(pending).toMatchObject({ kind: "approve", decision: { approve: { by: "reviewer", requestId: "req1" } } });
    expect(pending.message).toMatch(/The request is filed \(id req1\)/);
    expect(pending.say).toBe("I've asked for approval. I'll let you know when there's an answer.");
    expect(scute.paths("/v1/auth/app1/agent/approvals")[0].body).toMatchObject({
      action: "refund",
      resource: { type: "invoice", key: "42" },
      reason: "refund_invoice (invoice_id 42, amount 900)",
      details: { invoice_id: 42, amount: 900 },
    });
    expect((await run.approvalStatus("req1")).say).toBe("Still waiting.");

    scute.state.requestStatus = "approved";
    const approved = await run.check("refund_invoice", { invoice_id: 42, amount: 900 });
    expect(approved.kind).toBe("proceed");
    expect(scute.paths(CHECK).at(-1)!.body.approval).toBe("req1");
    expect((await run.snapshot()).approvals).toEqual({}); // spent
  });

  it("files nothing while observing", async () => {
    const scute = fakeScute({ decide: () => ({ decision: "allow_with_approval" }) });
    const run = createHarness({ ...base, mode: "observe", fetch: scute.fetch }).run({ actsFor: "user1" });

    const v = await run.check("refund_invoice", { id: 1 });
    expect(v.kind).toBe("proceed");
    expect(v.results[0]).toMatchObject({ mode: "observe", decision: { kind: "approve" } });
    expect(scute.paths("/v1/auth/app1/agent/approvals")).toHaveLength(0);
  });

  it("doesn't claim a request was filed when none was", async () => {
    const scute = fakeScute({ decide: () => ({ decision: "allow_with_approval", explanation: "Needs a reviewer." }) });
    const run = createHarness({ ...base, fetch: scute.fetch, guards: [guards.permissions({ fileRequests: false })] }).run({ actsFor: "user1" });

    const v = await run.check("refund_invoice", { id: 1 });
    expect(v.message).toBe("Needs a reviewer. Tell the person it needs a reviewer's approval.");
    expect(scute.paths("/v1/auth/app1/agent/approvals")).toHaveLength(0);
  });
});

describe("runs", () => {
  it("resume from the store by id, without a new task", async () => {
    const scute = fakeScute();
    const store = memoryStore();
    const h = createHarness({ ...base, fetch: scute.fetch, store });

    await h.run({ id: "chat-1", actsFor: "user1" }).check("read_invoice", { id: 1 });
    await h.run({ id: "chat-1", actsFor: "user1" }).check("read_invoice", { id: 2 });

    expect(scute.paths(MINT)).toHaveLength(1);
    expect(scute.paths(CHECK).map((c) => c.auth)).toEqual(["Bearer sct_token1", "Bearer sct_token1"]);
  });

  it("start a new task when the old one expired, but never after it was closed", async () => {
    const scute = fakeScute({ ttlMs: 1000 });
    const h = createHarness({ ...base, fetch: scute.fetch });
    const run = h.run({ actsFor: "user1" });

    await run.check("read_invoice", { id: 1 });
    await run.check("read_invoice", { id: 1 });
    expect(scute.paths(MINT)).toHaveLength(2); // expires inside the 5s margin

    const closed = fakeScute({ decide: () => ({ decision: "deny", reason: "task_closed", explanation: "This task is revoked; start a new one." }) });
    const run2 = createHarness({ ...base, fetch: closed.fetch }).run({ actsFor: "user1" });
    expect((await run2.check("read_invoice", { id: 1 })).kind).toBe("deny");
    await expect(run2.token()).rejects.toThrow(/task is closed/);
    expect((await run2.snapshot()).closed).toBe(true);
  });

  it("close the run when Scute pauses the agent for going over its budget", async () => {
    const paused = fakeScute({
      decide: () => ({ decision: "deny", reason: "budget_exceeded", explanation: "Support bot went over its budget and was paused." }),
    });
    const run = createHarness({ ...base, fetch: paused.fetch }).run({ actsFor: "user1" });

    expect((await run.check("read_invoice", { id: 1 })).kind).toBe("deny");
    await expect(run.token()).rejects.toThrow(/task is closed/);
    expect(paused.paths(MINT)).toHaveLength(1);
  });

  it("use a task token from your backend without the secret", async () => {
    const scute = fakeScute();
    const run = createHarness({ agent: "support-bot", appId: "app1", baseUrl: "https://scute.test", fetch: scute.fetch }).run({
      token: "sct_from_backend",
    });

    expect((await run.check("read_invoice", { id: 1 })).kind).toBe("proceed");
    expect(scute.paths(CHECK)[0].auth).toBe("Bearer sct_from_backend");
    expect(scute.paths(MINT)).toHaveLength(0);
  });

  it("need the secret to start a task", async () => {
    const run = createHarness({ agent: "support-bot", appId: "app1", fetch: fakeScute().fetch }).run({ actsFor: "user1" });
    const v = await run.check("read_invoice", { id: 1 });
    expect(v.kind).toBe("deny");
    expect(String(v.results[0].error)).toMatch(/SCUTE_SECRET/);
  });

  it("pass the parent task to a sub-agent's task", async () => {
    const scute = fakeScute();
    const h = createHarness({ ...base, fetch: scute.fetch });
    const parent = h.run({ actsFor: "user1" });
    const child = h.run({ actsFor: "user1", parent });

    await child.check("read_invoice", { id: 1 });
    expect(scute.paths(MINT).map((m) => m.body.parent_task_id)).toEqual([undefined, "task1"]);
  });

  it("complete and revoke their task", async () => {
    const scute = fakeScute();
    const run = createHarness({ ...base, fetch: scute.fetch }).run({ actsFor: "user1" });
    await run.check("read_invoice", { id: 1 });
    await run.revoke();
    expect(scute.seen.at(-1)!.path).toBe(`${MINT}/task1/revoke`);
    await expect(run.token()).rejects.toThrow(/task is closed/);
  });

  it("list the tools inside the task's ceiling", async () => {
    const run = createHarness({ ...base, fetch: fakeScute({ ceiling: ["invoice:read"] }).fetch, tools: { get_weather: false } }).run({
      actsFor: "user1",
    });
    expect(await run.allowedTools(["read_invoice", "refund_invoice", "get_weather"])).toEqual(["read_invoice", "get_weather"]);
  });
});

describe("combining guards", () => {
  const scute = () => fakeScute();

  it("strictest enforced decision wins, and verify ranks above approve", async () => {
    const h = createHarness({
      ...base,
      fetch: scute().fetch,
      guards: [
        guards.define("a", (c) => c.approve("confirm")),
        guards.define("v", (c) => c.verify("verify")),
        guards.define("t", (c) => c.transform({ ...c.args, x: 1 })),
      ],
    });
    const v = await h.run().check("read_invoice", {});
    expect(v).toMatchObject({ kind: "verify", decision: { guard: "v" }, args: { x: 1 } });
  });

  it("later guards see transformed arguments", async () => {
    const seenBy: unknown[] = [];
    const h = createHarness({
      ...base,
      fetch: scute().fetch,
      guards: [
        guards.define("cap", (c) => c.transform({ ...c.args, amount: Math.min(Number(c.args.amount), 100) })),
        guards.define("look", (c) => {
          seenBy.push(c.args.amount);
        }),
      ],
    });
    const v = await h.run().check("refund_invoice", { amount: 900 });
    expect(v).toMatchObject({ kind: "transform", args: { amount: 100 } });
    expect(seenBy).toEqual([100]);
  });

  it("stops at the first deny", async () => {
    const later = vi.fn();
    const h = createHarness({ ...base, fetch: scute().fetch, guards: [guards.define("no", (c) => c.deny("no")), guards.define("later", later)] });
    expect((await h.run().check("x", {})).kind).toBe("deny");
    expect(later).not.toHaveBeenCalled();
  });

  it("observe and monitor never block; monitor alerts; errors fail closed only when enforced", async () => {
    const onAlert = vi.fn();
    const boom = () => {
      throw new Error("boom");
    };
    const h = createHarness({
      ...base,
      fetch: scute().fetch,
      onAlert,
      guards: [
        guards.define("o", (c) => c.deny("o"), { mode: "observe" }),
        guards.define("m", (c) => c.guide("m"), { mode: "monitor" }),
        guards.define("e", boom, { mode: "observe" }),
      ],
    });
    const v = await h.run().check("x", {});
    expect(v.kind).toBe("proceed");
    expect(v.results.map((r) => r.decision.kind)).toEqual(["deny", "guide", "deny"]);
    expect(onAlert).toHaveBeenCalledTimes(1);
    expect(onAlert.mock.calls[0][0]).toMatchObject({ guard: "m", decision: { kind: "guide" } });

    const enforced = createHarness({ ...base, fetch: scute().fetch, guards: [guards.define("e", boom)] });
    expect((await enforced.run().check("x", {})).decision).toMatchObject({ kind: "deny", reason: "guard_error" });
  });

  it("reports every decision, and a throwing hook changes nothing", async () => {
    const events: DecisionEvent[] = [];
    const h = createHarness({
      ...base,
      fetch: scute().fetch,
      guards: [guards.define("g", (c) => c.guide("ask first", "custom"))],
      onDecision: (e) => {
        events.push(e);
        throw new Error("hook broke");
      },
    });
    const v = await h.run({ id: "r1" }).check("refund_invoice", { amount: 5 }, { id: "call1" });
    expect(v.kind).toBe("guide");
    expect(events[0]).toMatchObject({ run: "r1", agent: "support-bot", tool: "refund_invoice", callId: "call1", phase: "before", kind: "guide", guard: "g", reason: "custom" });
  });

  it("wraps a plain function", async () => {
    const h = createHarness({
      ...base,
      fetch: scute().fetch,
      guards: [guards.define("small", (c) => (Number(c.args.amount) > 100 ? c.guide("Keep it under 100.") : undefined))],
    });
    const run = h.run();
    const refund = run.wrap("refund_invoice", async (a: { amount: number }) => `refunded ${a.amount}`);
    expect(await refund({ amount: 50 })).toBe("refunded 50");
    expect(await refund({ amount: 500 })).toBe("Keep it under 100.");
    expect((await run.snapshot()).calls).toBe(1);
  });

  it("needs an agent and an app id", () => {
    expect(() => createHarness({ agent: "", appId: "a" })).toThrow(/agent/);
    expect(() => createHarness({ agent: "x" })).toThrow(/SCUTE_APP_ID/);
  });

  describe("properties (RB-42)", () => {
    it("reads a secret and signs with the task token", async () => {
      const scute = fakeScute();
      const run = createHarness({ ...base, fetch: scute.fetch }).run({ actsFor: "user1" });

      expect(await run.property("stripe")).toBe("sk_live_123");
      expect(await run.sign("mandates", { claims: { amount: 4200 } })).toMatchObject({ jws: "h.b.s", kid: "prop_1" });
      expect(await run.sign("mandates", { data: "aGVsbG8" })).toMatchObject({ signature: "c2ln" });

      const reads = scute.seen.filter((s) => s.path.startsWith("/v1/auth/app1/agent/properties/"));
      expect(reads.every((s) => s.auth?.startsWith("Bearer sct_"))).toBe(true);
      expect(scute.seen.find((s) => s.path.endsWith("/mandates/sign"))?.body).toEqual({ claims: { amount: 4200 } });
    });

    it("surfaces a refusal", async () => {
      const run = createHarness({ ...base, fetch: fakeScute().fetch }).run({ actsFor: "user1" });

      await expect(run.property("locked")).rejects.toMatchObject({ status: 403, code: "agent_not_listed" });
    });
  });
});

describe("plans and previews (RB-45)", () => {
  it("files a plan from tool calls, then checks each call with the plan and its exact arguments", async () => {
    const scute = fakeScute();
    const run = createHarness({ ...base, fetch: scute.fetch }).run({ actsFor: "user1" });

    const plan = await run.requestPlan(
      [
        { tool: "refund_invoice", args: { invoice_id: 1, amount: 40 } },
        { tool: "refund_invoice", args: { invoice_id: 2, amount: 15 } },
      ],
      "Two refunds for ticket 88"
    );
    expect(plan.id).toBe("plan1");
    const [filed] = scute.paths("/v1/auth/app1/agent/plans");
    expect(filed.body.reason).toBe("Two refunds for ticket 88");
    expect(filed.body.steps).toEqual([
      expect.objectContaining({ action: "refund", resource: { type: "invoice", key: "1" }, details: { invoice_id: 1, amount: 40 } }),
      expect.objectContaining({ action: "refund", resource: { type: "invoice", key: "2" }, details: { invoice_id: 2, amount: 15 } }),
    ]);
    expect((await run.snapshot()).planId).toBe("plan1");

    await run.check("refund_invoice", { invoice_id: 2, amount: 15 });
    const checks = scute.paths(CHECK);
    expect(checks.at(-1)!.body).toMatchObject({ plan: "plan1", details: { invoice_id: 2, amount: 15 } });
  });

  it("previews a call as a dry run, without proofs and without using the budget", async () => {
    const scute = fakeScute();
    const run = createHarness({ ...base, fetch: scute.fetch, guards: [guards.permissions(), guards.budget({ calls: 1 })] }).run({ actsFor: "user1" });

    for (let i = 0; i < 3; i++) await run.preview("refund_invoice", { invoice_id: 1, amount: 40 });
    const sent = scute.paths(CHECK).map((c) => c.body);
    expect(sent).toHaveLength(3);
    expect(sent.every((b) => b.dry_run === true && b.plan === undefined && b.challenge === undefined && b.approval === undefined)).toBe(true);
    expect((await run.check("refund_invoice", { invoice_id: 1, amount: 40 })).kind).toBe("proceed"); // the budget's one call is still there
    expect((await run.check("refund_invoice", { invoice_id: 1, amount: 40 })).kind).not.toBe("proceed"); // and now it's used
  });
});
