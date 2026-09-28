// DX-08 item 8: agents, through @scute/harness. Register agents, mint tasks,
// check tool calls (allow, deny outside the task), step-up with a test
// identity, a reviewer's approval, properties (a secret and a signature
// verified with the property's JWKS), and a budget that pauses the agent.

import { createPublicKey, randomBytes, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createHarness, guards, type Harness, type Run } from "@scute/harness";
import type { LiveContext } from "../lib/context";
import { TEST_CODE } from "../lib/context";
import { ok, refusal, safely, tamper } from "../lib/check";
import { verifyJws, type Jwk } from "../lib/jws";

type AgentJson = { slug: string; status: string; roles: string[]; settings?: Record<string, any>; suspended_reason?: string };
type TaskJson = { id: string; status: string; acts_for?: string; ref?: string; actions?: string[] };

/** Tool names to permissions (the resource's slug has dashes, so the naming convention can't guess it). */
export const toolsFor = (ctx: LiveContext) => ({
  read_doc: { permission: ctx.perm("read"), key: "doc_id" },
  edit_doc: { permission: ctx.perm("edit"), key: "doc_id", tier: "medium" as const },
  delete_doc: { permission: ctx.perm("delete"), key: "doc_id", tier: "high" as const },
  purge_doc: { permission: ctx.perm("purge"), key: "doc_id", tier: "high" as const },
});

export const harnessFor = (ctx: LiveContext, agent: string): Harness =>
  createHarness({
    agent,
    appId: ctx.env.appId,
    secret: ctx.env.secret,
    baseUrl: ctx.env.baseUrl,
    guards: [guards.permissions()],
    tools: toolsFor(ctx),
  });

// No SDK method for registering or managing agents: /v1/apps/:app_id/authz/agents.
export async function registerAgent(ctx: LiveContext, name: string, body: Record<string, unknown> = {}): Promise<AgentJson> {
  const { data } = await ctx.api.post<AgentJson>(`${ctx.api.appPath}/authz/agents`, {
    slug: ctx.agent(name),
    name: `Live ${ctx.runId} ${name}`,
    description: `Made by the JS live suite, run ${ctx.runId}`,
    roles: [ctx.role("agent")],
    ...body,
  });
  ctx.state.agents[name] = true;
  return data;
}

const getAgent = (ctx: LiveContext, name: string) => ctx.api.get<AgentJson>(`${ctx.api.appPath}/authz/agents/${ctx.agent(name)}`);
const agentVerb = (ctx: LiveContext, name: string, verb: "suspend" | "resume", body?: Record<string, unknown>) =>
  ctx.api.post<AgentJson>(`${ctx.api.appPath}/authz/agents/${ctx.agent(name)}/${verb}`, body ?? {});
const tasksOf = async (ctx: LiveContext, name: string) =>
  (await ctx.api.get<{ tasks: TaskJson[] }>(`${ctx.api.appPath}/authz/agents/${ctx.agent(name)}/tasks`)).data.tasks;

export function agentsSuite(get: () => LiveContext) {
  describe("8. agents and the harness", () => {
    let helper: Harness | undefined;
    let run: Run | undefined;

    it("registers agents with roles and a budget (no SDK method: POST /authz/agents)", async ({ skip }) => {
      const ctx = get();
      if (!ctx.state.policyImported) skip("needs the imported policy (the agent role)");
      const a = await registerAgent(ctx, "helper");
      expect(a.status).toBe("active");
      expect(a.roles).toEqual([ctx.role("agent")]);

      const b = await registerAgent(ctx, "budget", { settings: { budget: { max_actions: 2, window_minutes: 1440 } } });
      expect(b.settings?.budget?.max_actions).toBe(2);
      expect((await getAgent(ctx, "budget")).data.status).toBe("active");
      helper = harnessFor(ctx, ctx.agent("helper"));
    });

    it("mints a task for a person and reads whoami (harness.run, run.whoami, run.taskId)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const h = helper ?? skip("needs the registered agent");
      run = h.run({ actsFor: main.id, task: { actions: [ctx.perm("read"), ctx.perm("edit")], ttl: 900, ref: `${ctx.prefix}-task` } });

      const me = await safely(() => run!.whoami(), "run.whoami");
      expect(me.agent).toBe(ctx.agent("helper"));
      expect(me.acts_for).toBe(main.id);
      expect(me.ceiling).toEqual([ctx.perm("edit"), ctx.perm("read")].sort());
      expect(me.step_up).toContain(ctx.perm("edit"));

      const taskId = await safely(() => run!.taskId(), "run.taskId");
      const task = (await tasksOf(ctx, "helper")).find((t) => t.id === taskId);
      expect(task?.status).toBe("open");
      expect(task?.acts_for).toBe(main.id);
      expect(task?.ref).toBe(`${ctx.prefix}-task`);
    });

    it("lets a call inside the task through and denies one outside it (run.check)", async ({ skip }) => {
      const r = run ?? skip("needs the run");
      const inside = await safely(() => r.check("read_doc", { doc_id: "1" }), "run.check read_doc");
      expect(inside.kind, inside.decision.reason).toBe("proceed");

      const outside = await safely(() => r.check("delete_doc", { doc_id: "1" }), "run.check delete_doc");
      expect(outside.kind).toBe("deny");
      expect(outside.decision.reason).toBe("outside_task");
      expect(outside.message).toMatch(/Don't retry/);
    });

    it("steps up through human steps: the person verifies with a test identity's code (startVerification, submitCode)", async ({ skip }) => {
      const ctx = get();
      const r = run ?? skip("needs the run");
      const asked = await safely(() => r.check("edit_doc", { doc_id: "2" }), "run.check edit_doc");
      expect(asked.kind, asked.decision.reason).toBe("verify");
      expect(asked.decision.verify?.permission).toBe(ctx.perm("edit"));

      const started = await safely(() => r.startVerification({ verdict: asked, method: "email_otp" }), "run.startVerification");
      expect(started.status).toBe("pending");
      expect(started.method).toBe("email_otp");
      expect(started.say).toMatch(/emailed a code/);

      const finished = await safely(() => r.submitCode(TEST_CODE), "run.submitCode");
      expect(finished.status).toBe("completed");

      const after = await safely(() => r.check("edit_doc", { doc_id: "2" }), "run.check edit_doc again");
      expect(after.kind, after.decision.reason).toBe("proceed");
      expect(after.decision.reason).toBe("verified");
    });

    it("files a reviewer approval for the exact call, and runs it once approved", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const h = helper ?? skip("needs the registered agent");
      const r = h.run({ actsFor: main.id, task: { actions: [ctx.perm("read"), ctx.perm("delete")] } });

      const asked = await safely(() => r.check("delete_doc", { doc_id: "9" }), "run.check delete_doc");
      expect(asked.kind, asked.decision.reason).toBe("approve");
      expect(asked.decision.approve?.by).toBe("reviewer");
      const requestId = asked.decision.approve?.requestId;
      if (!requestId) throw new Error("the harness filed no access request for the call");
      expect((await safely(() => r.approvalStatus(requestId), "run.approvalStatus")).status).toBe("pending");

      ok(await ctx.admin.authzDecideRequest(requestId, "approve", { note: "live test" }), "authzDecideRequest");
      const after = await safely(() => r.check("delete_doc", { doc_id: "9" }), "run.check delete_doc again");
      expect(after.kind, after.decision.reason).toBe("proceed");
      await safely(() => r.complete(), "run.complete");
    });

    it("reads a secret property and signs with a key pair; the signature verifies with the property's JWKS", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const r = run ?? skip("needs the run");
      const secretName = `${ctx.prefix}-api-key`;
      const signerName = `${ctx.prefix}-signer`;
      const secretValue = randomBytes(18).toString("base64url");

      // No SDK method for making properties: POST /v1/apps/:app_id/properties.
      await ctx.api.post(`${ctx.api.appPath}/properties`, {
        name: secretName,
        kind: "secret",
        value: secretValue,
        agents: [ctx.agent("helper")],
        description: "JS live suite",
      });
      ctx.state.properties[secretName] = true;
      const { data: signer } = await ctx.api.post(`${ctx.api.appPath}/properties`, {
        name: signerName,
        kind: "keypair",
        algorithm: "ES256",
        agents: [ctx.agent("helper")],
      });
      ctx.state.properties[signerName] = true;
      expect(signer.algorithm).toBe("ES256");

      const value = await safely(() => r.property(secretName), "run.property");
      expect(value === secretValue, "the secret comes back exactly as set").toBe(true);

      const signed = await safely(() => r.sign(signerName, { claims: { sub: main.id, purpose: `${ctx.prefix}-live` } }), "run.sign claims");
      expect(signed.alg).toBe("ES256");
      expect(signed.kid).toBe(signer.key_id);
      const { data: jwks } = await ctx.api.get<{ keys: Jwk[] }>(`${ctx.api.authPath}/properties/${signerName}/jwks.json`, { auth: "none" });
      const checked = verifyJws(signed.jws ?? "", jwks);
      expect(checked.ok, checked.ok ? "" : checked.reason).toBe(true);
      if (checked.ok) {
        expect(checked.claims.purpose).toBe(`${ctx.prefix}-live`);
        expect(checked.claims.iss).toBe(`${ctx.env.appId}/properties/${signerName}`);
        expect(typeof checked.claims.iat).toBe("number");
      }
      expect(verifyJws(tamper(signed.jws ?? "a.b.c"), jwks).ok, "a tampered signature doesn't verify").toBe(false);

      const bytes = Buffer.from(`${ctx.prefix} raw bytes`);
      const raw = await safely(() => r.sign(signerName, { data: bytes.toString("base64url") }), "run.sign data");
      const jwk = jwks.keys.find((k) => k.kid === raw.kid);
      expect(jwk, "the signing key is in the JWKS").toBeTruthy();
      const rawOk = verify(
        "sha256",
        new Uint8Array(bytes),
        { key: createPublicKey({ key: jwk!, format: "jwk" }), dsaEncoding: "ieee-p1363" },
        new Uint8Array(Buffer.from(raw.signature ?? "", "base64url"))
      );
      expect(rawOk, "the raw signature verifies").toBe(true);

      // An agent the property doesn't list is refused.
      const other = harnessFor(ctx, ctx.agent("budget")).run({ actsFor: main.id, task: { actions: [ctx.perm("read")] } });
      const refused = await refusal(() => other.property(secretName));
      expect(refused.status, refused.message).toBe(403);
      expect(refused.code).toBe("agent_not_listed");
      await safely(() => other.revoke(), "run.revoke");
    });

    it("a budget of 2 pauses the agent on the 3rd action, and the run closes", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      if (!ctx.state.agents.budget) skip("needs the budget agent");
      const r = harnessFor(ctx, ctx.agent("budget")).run({ actsFor: main.id, task: { actions: [ctx.perm("read")] } });

      const first = await safely(() => r.check("read_doc", { doc_id: "11" }), "check 1");
      const second = await safely(() => r.check("read_doc", { doc_id: "12" }), "check 2");
      const third = await safely(() => r.check("read_doc", { doc_id: "13" }), "check 3");
      expect([first.kind, second.kind, third.kind]).toEqual(["proceed", "proceed", "deny"]);
      expect(third.decision.reason).toBe("budget_exceeded");
      expect((await r.snapshot()).closed, "the run is closed for good").toBe(true);

      const agent = (await getAgent(ctx, "budget")).data;
      expect(agent.status).toBe("suspended");
      expect(agent.suspended_reason).toMatch(/budget/i);
    });

    it("suspends and resumes an agent; a suspended agent gets no tasks (no SDK method: /authz/agents/:slug/suspend|resume)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      if (!ctx.state.agents.budget) skip("needs the budget agent");

      expect((await agentVerb(ctx, "budget", "resume")).data.status).toBe("active");
      // A roomier budget, so the checks below don't pause it again.
      await ctx.api.patch(`${ctx.api.appPath}/authz/agents/${ctx.agent("budget")}`, { settings: { budget: { max_actions: 100 } } });

      const suspended = (await agentVerb(ctx, "budget", "suspend", { reason: `${ctx.prefix}: kill switch` })).data;
      expect(suspended.status).toBe("suspended");
      expect(suspended.suspended_reason).toBe(`${ctx.prefix}: kill switch`);
      const h = harnessFor(ctx, ctx.agent("budget"));
      const blocked = await refusal(() => h.run({ actsFor: main.id }).token());
      expect(blocked.status, blocked.message).toBe(409);
      expect(blocked.code).toBe("agent_suspended");

      expect((await agentVerb(ctx, "budget", "resume")).data.status).toBe("active");
      const r = h.run({ actsFor: main.id, task: { actions: [ctx.perm("read")] } });
      expect((await safely(() => r.check("read_doc", { doc_id: "14" }), "check after resume")).kind).toBe("proceed");
      await safely(() => r.complete(), "run.complete");
    });

    it("completes a task (run.complete); the task closes and the run stops", async ({ skip }) => {
      const ctx = get();
      const r = run ?? skip("needs the run");
      const taskId = await safely(() => r.taskId(), "run.taskId");
      await safely(() => r.complete(), "run.complete");
      expect((await tasksOf(ctx, "helper")).find((t) => t.id === taskId)?.status).toBe("completed");
      expect((await safely(() => r.check("read_doc", { doc_id: "1" }), "run.check after complete")).kind).toBe("deny");
    });
  });
}
