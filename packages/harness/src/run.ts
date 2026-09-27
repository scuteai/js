import { ScuteHarnessError, type Approval, type Verification, type Whoami } from "./client";
import { resourceRef } from "./convention";
import { Call, describeCall, runs } from "./decisions";
import { aiSdkPrepareStep, aiSdkToolApproval, aiSdkTools, type AiSdkApprovalStatus } from "./adapters/ai-sdk";
import { humanTools, type JsonSchemaFn } from "./adapters/human-tools";
import type { Harness } from "./harness";
import type { Args, Decision, EngineDecision, Tier, ToolCall, Verdict } from "./types";

export type RunOptions = {
  /**
   * Where this run's state lives (task token, verifications, approvals,
   * counters). Reuse one id per conversation or call so a later request
   * picks up where the last one stopped.
   */
  id?: string;
  /** The app user the agent works for. Omit for an agent working on its own. */
  actsFor?: string;
  /** Narrow the task: permission slugs, objects ("invoice:42" or "invoice"), lifetime, your reference. */
  task?: { actions?: string[]; resources?: string[]; ttl?: number; ref?: string };
  /** Who asked, when it isn't the person the agent acts for (a helpdesk caller). */
  requester?: { email?: string; phone?: string; app_user_id?: string; name?: string };
  /** The run that started this one (orchestrator to sub-agent). The child can't outlive it. */
  parent?: Run;
  /** A task token minted elsewhere (your backend), for an agent that runs without the secret key. */
  token?: string;
  /** Session details for voice and chat channels. */
  session?: { channel?: string; externalRef?: string; caller?: Record<string, unknown> };
  /** Sent with every check, for policy conditions on `context.*`. */
  context?: Record<string, unknown>;
};

type RunState = {
  token?: string;
  taskId?: string;
  expiresAt?: string;
  actsFor?: string | null;
  minted?: boolean;
  closed?: boolean;
  sessionId?: string;
  verifiedAt?: number;
  pending?: { token: string; permission?: string };
  /** permission -> completed challenge token */
  challenges: Record<string, string>;
  /** "permission|object" -> access request id */
  approvals: Record<string, string>;
  /** Calls the person confirmed in your UI (tool + arguments), each good once. */
  confirmed?: string[];
  calls: number;
  usd: number;
};

type CheckOptions = { id?: string; messages?: unknown[]; approvedByUser?: boolean };

const HOUR = 3600_000;

export const randomId = () =>
  (globalThis as any).crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
    ? Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])])
    : value;

const fingerprint = (tool: string, args: Args) => JSON.stringify([tool, canonical(args ?? {})]);

const approvalKey = (call: ToolCall) => `${call.permission}|${resourceRef(call.resource)}`;

/** One job an agent does: a Scute task, its session, and what the guards remember about it. */
export class Run {
  readonly id: string;
  private state?: RunState;
  private loading?: Promise<RunState>;
  private minting?: Promise<string>;
  private opening?: Promise<string>;
  private me?: Promise<Whoami>;
  private kept = new Map<string, Verdict>();
  private grounded = new Set<string>();
  private identified = new Set<string>();
  /** Tool names seen through tools(); prepareStep narrows these. */
  toolNames: string[] = [];
  /** @internal humanTools() names, always offered to the model. */
  humanToolNames: string[] = [];
  /** @internal the last verification a guard asked for, for the verify_person tool. */
  lastVerify?: Decision["verify"];

  constructor(readonly harness: Harness, readonly options: RunOptions = {}) {
    this.id = options.id ?? randomId();
  }

  private get key() {
    return `scute:run:${this.harness.agent}:${this.id}`;
  }

  private async load(): Promise<RunState> {
    if (this.state) return this.state;
    this.loading ??= (async () => {
      const raw = await this.harness.store.get(this.key);
      this.state = raw ? (JSON.parse(raw) as RunState) : { challenges: {}, approvals: {}, calls: 0, usd: 0 };
      return this.state;
    })();
    return this.loading;
  }

  private async save() {
    const s = await this.load();
    const until = s.expiresAt ? Math.ceil((Date.parse(s.expiresAt) - Date.now()) / 1000) : 0;
    // Keep state a day past the task, so a conversation resumed later still has its counters.
    await this.harness.store.set(this.key, JSON.stringify(s), Math.max(until, 0) + 86400);
  }

  /** A copy of what this run remembers (task, verification, counters). */
  async snapshot(): Promise<Readonly<RunState>> {
    return JSON.parse(JSON.stringify(await this.load()));
  }

  // ── Task ──

  /** The task token, starting the task on first use. */
  async token(): Promise<string> {
    if (this.options.token) return this.options.token;
    const s = await this.load();
    if (s.closed) throw new ScuteHarnessError("This run's task is closed; start a new run", 409, "task_closed");
    if (s.token && !(s.expiresAt && Date.parse(s.expiresAt) <= Date.now() + 5000)) return s.token;
    this.minting ??= this.mint().finally(() => {
      this.minting = undefined;
    });
    return this.minting;
  }

  private async mint(): Promise<string> {
    const { harness, options } = this;
    if (!harness.client.canManage) {
      throw new ScuteHarnessError(
        "A run needs SCUTE_SECRET to start a task, or a task token (run({ token })) minted by your backend",
        401,
        "no_credentials"
      );
    }
    const parent = options.parent ? await options.parent.taskId() : undefined;
    const minted = await harness.client.mintTask(harness.agent, {
      acts_for: options.actsFor,
      actions: options.task?.actions,
      resources: options.task?.resources,
      ttl_seconds: options.task?.ttl,
      ref: options.task?.ref,
      requester: options.requester,
      parent_task_id: parent,
    });
    const s = await this.load();
    Object.assign(s, {
      token: minted.token,
      taskId: minted.id,
      expiresAt: minted.expires_at,
      actsFor: minted.acts_for ?? null,
      minted: true,
      sessionId: undefined,
    });
    this.me = undefined;
    await this.save();
    return minted.token;
  }

  async taskId(): Promise<string> {
    if (this.options.token) return (await this.whoami()).task;
    await this.token();
    return (await this.load()).taskId!;
  }

  /** Who the agent works for, what the task allows and its ceiling. Cached per run. */
  whoami(): Promise<Whoami> {
    this.me ??= this.token().then((t) => this.harness.client.whoami(t));
    this.me.catch(() => {
      this.me = undefined;
    });
    return this.me;
  }


  /** The job is done: close the task (and its session). */
  complete() {
    return this.close("complete");
  }

  /** Stop this run now: the task token stops working everywhere. */
  revoke() {
    return this.close("revoke");
  }

  private async close(verb: "complete" | "revoke") {
    const s = await this.load();
    if (s.sessionId && s.token) await this.harness.client.endSession(s.token, s.sessionId).catch(() => undefined);
    if (s.taskId) await this.harness.client.closeTask(this.harness.agent, s.taskId, verb);
    s.closed = true;
    await this.save();
  }

  // ── Session and verification ──

  /** The run's session (created on first use). Verification and "trust for this task" live on it. */
  async session(): Promise<string> {
    const s = await this.load();
    if (s.sessionId) return s.sessionId;
    this.opening ??= (async () => {
      const token = await this.token();
      const created = await this.harness.client.createSession(token, {
        channel: this.options.session?.channel ?? "chat",
        external_ref: this.options.session?.externalRef ?? this.id,
        caller: this.options.session?.caller,
      });
      s.sessionId = created.id;
      await this.save();
      return created.id;
    })().finally(() => {
      this.opening = undefined;
    });
    return this.opening;
  }

  /**
   * Send the person a verification for this run: a code by email or text,
   * their authenticator app, or a push. Pass the verdict that asked for it,
   * or a method and permission. Works with the task token alone; the answer
   * has a `say` line for the person.
   */
  async startVerification(options: { verdict?: Pick<Verdict, "decision">; method?: string; permission?: string } = {}): Promise<Verification> {
    const asked = options.verdict?.decision.verify ?? this.lastVerify;
    const permission = options.permission ?? asked?.permission;
    const methods = [options.method, asked?.method, ...(asked?.methods ?? [])].filter((m): m is string => !!m && m !== "any");
    if (!methods.length) {
      throw new ScuteHarnessError("Pick a verification method (email_otp, sms_otp, totp, entra_push...)", 422, "method_required");
    }
    const verification = await this.harness.client.startVerification(await this.token(), {
      method: methods[0],
      permission,
      session_id: await this.session(),
    });
    const s = await this.load();
    s.pending = { token: verification.token, permission };
    await this.save();
    return verification;
  }

  /** The person read out the code they got. A wrong code comes back with status "pending" and a `say` line. */
  async submitCode(code: string, challengeToken?: string): Promise<Verification> {
    const token = challengeToken ?? (await this.load()).pending?.token;
    if (!token) throw new ScuteHarnessError("No verification in progress", 422, "no_challenge");
    let verification: Verification;
    try {
      verification = await this.harness.client.submitCode(await this.token(), token, code);
    } catch (e) {
      if (e instanceof ScuteHarnessError && e.status === 422 && (e.body as Verification | undefined)?.status) return e.body as Verification;
      throw e;
    }
    if (verification.status === "completed") await this.recordVerified(token);
    return verification;
  }

  /** Where a verification stands (poll this for pushes). Recorded once it's complete. */
  async verificationStatus(challengeToken?: string): Promise<Verification> {
    const token = challengeToken ?? (await this.load()).pending?.token;
    if (!token) throw new ScuteHarnessError("No verification in progress", 422, "no_challenge");
    const verification = await this.harness.client.verification(await this.token(), token);
    if (verification.status === "completed") await this.recordVerified(token);
    return verification;
  }

  /**
   * Record a finished verification. For one this run started, Scute reports
   * it; for a challenge your backend started, Scute checks it's the person's,
   * completed and fresh. Throws when it isn't done yet.
   */
  async completeVerification(challengeToken?: string) {
    const s = await this.load();
    const token = challengeToken ?? s.pending?.token;
    if (!token) throw new ScuteHarnessError("No verification to complete", 422, "no_challenge");
    if (s.pending?.token === token) {
      const verification = await this.verificationStatus(token);
      if (verification.status !== "completed") {
        throw new ScuteHarnessError(`Not verified yet (${verification.status})`, 409, "not_verified");
      }
      return;
    }
    await this.harness.client.verifySession(await this.token(), await this.session(), token);
    await this.recordVerified(token);
  }

  private async recordVerified(token: string) {
    const s = await this.load();
    s.verifiedAt = Date.now();
    if (s.pending?.token === token) {
      if (s.pending.permission) s.challenges[s.pending.permission] = token;
      s.pending = undefined;
    }
    await this.save();
  }

  /** The person confirmed this exact call in your UI; guards.approval() lets it through once. */
  async confirm(tool: string, args: Args) {
    const s = await this.load();
    (s.confirmed ??= []).push(fingerprint(tool, args));
    await this.save();
  }

  /** @internal */
  async consumeConfirmation(call: ToolCall): Promise<boolean> {
    const s = await this.load();
    const at = (s.confirmed ?? []).indexOf(fingerprint(call.tool, call.args));
    if (at < 0) return false;
    s.confirmed!.splice(at, 1);
    await this.save();
    return true;
  }

  /** When the person last verified in this run (ms), if they have. */
  async verifiedAt(): Promise<number | undefined> {
    return (await this.load()).verifiedAt;
  }

  // ── Engine ──

  /** Ask Scute about a call (agent roles, the human, the task). Used by guards.permissions(). */
  async engineCheck(call: ToolCall, context?: Record<string, unknown>): Promise<EngineDecision> {
    const s = await this.load();
    const permission = call.permission!;
    const approval = s.approvals[approvalKey(call)];
    const decision = await this.harness.client.check(await this.token(), {
      action: call.spec.action!,
      resource: call.resource,
      context: { ...this.options.context, ...context },
      challenge: s.challenges[permission],
      approval,
      session_id: s.sessionId,
    });
    if (decision.reason === "task_closed") {
      s.closed = true;
      await this.save();
    } else if (approval && decision.decision === "allow") {
      delete s.approvals[approvalKey(call)]; // spent
      await this.save();
    }
    return decision;
  }

  /**
   * File (or find) the access request a reviewer approves for this call.
   * Scute returns the open one if it exists, so this is safe to repeat.
   */
  async requestApproval(call: ToolCall): Promise<Approval | undefined> {
    if (!call.permission || !call.spec.action) return undefined;
    const approval = await this.harness.client.requestApproval(await this.token(), {
      action: call.spec.action,
      resource: call.resource,
      reason: describeCall(call),
      context: this.options.context,
    });
    if (!approval.id) return undefined;
    const s = await this.load();
    s.approvals[approvalKey(call)] = approval.id;
    await this.save();
    return approval;
  }

  /** Where an approval this run filed stands, with a `say` line. */
  async approvalStatus(id: string): Promise<Approval> {
    return this.harness.client.approval(await this.token(), id);
  }

  // ── Checking calls ──

  /** Run the guards on a call before it happens. */
  async check(tool: string, args: Args, options: CheckOptions = {}): Promise<Verdict> {
    const call = new Call(this, options.id ?? randomId(), tool, args, this.harness.spec(tool), options.messages ?? [], !!options.approvedByUser);
    return this.harness.evaluate(call);
  }

  /** Record a call that ran and run the after-guards on its result. Returns what the model should see. */
  async after(tool: string, args: Args, result: unknown, options: CheckOptions = {}) {
    const spec = this.harness.spec(tool);
    const s = await this.load();
    s.calls += 1;
    await this.save();
    await this.harness.recordExecution(await this.budgetKey(), spec.tier);
    const call = new Call(this, options.id ?? randomId(), tool, args, spec, options.messages ?? [], !!options.approvedByUser);
    return this.harness.evaluateAfter(call, result);
  }

  /** Guard a plain function: when a call doesn't run, it returns the message for the model instead. */
  wrap<A extends Args, R>(tool: string, fn: (args: A) => R | Promise<R>) {
    return async (args: A): Promise<R | string> => {
      const verdict = await this.check(tool, args);
      if (!runs(verdict)) return verdict.message ?? "Not allowed.";
      const result = await fn(verdict.args as A);
      return (await this.after(tool, verdict.args, result)).result as R;
    };
  }

  /** @internal a proceed verdict from the approval step, reused when the tool executes. */
  keep(verdict: Verdict) {
    if (runs(verdict)) this.kept.set(verdict.callId, verdict);
  }

  /** @internal */
  take(callId?: string): Verdict | undefined {
    if (!callId) return undefined;
    const v = this.kept.get(callId);
    this.kept.delete(callId);
    return v;
  }

  // ── Grounding, usage, budgets ──

  /** Values you know are true for this run (the verified caller's email, an account id), for guards.grounding(). */
  ground(...values: unknown[]) {
    for (const v of values) if (v !== undefined && v !== null && v !== "") this.grounded.add(String(v).toLowerCase());
  }

  /** Who is asking, once you know (the verified caller's email or phone). For guards.requesterOnly(); also grounds them. */
  identify(...values: unknown[]) {
    for (const v of values) if (v !== undefined && v !== null && v !== "") this.identified.add(String(v).toLowerCase());
  }

  /** @internal the requester's details and what identify() added. */
  identities(): string[] {
    const requester = Object.values(this.options.requester ?? {}).filter(Boolean).map((v) => String(v).toLowerCase());
    return Array.from(new Set([...requester, ...this.identified]));
  }

  /** @internal */
  groundedValues(): string[] {
    return Array.from(new Set([...this.grounded, ...this.identities()]));
  }

  /** Model spend for budgets (harness.model() will report this itself). */
  async recordUsage(usage: { usd?: number }) {
    const s = await this.load();
    s.usd += usage.usd ?? 0;
    await this.save();
  }

  /** @internal hourly budgets count per agent and person, across runs. */
  async budgetKey() {
    const who = this.options.actsFor ?? (await this.load()).actsFor ?? "none";
    return `scute:hour:${this.harness.agent}:${who}`;
  }

  /** Executions in the last hour for this agent and person, by tier. */
  async recentExecutions(): Promise<{ at: number; tier: Tier }[]> {
    return this.harness.executions(await this.budgetKey(), HOUR);
  }

  /** True when a run budget (calls or spend, from guards.budget()) is used up. */
  async budgetExhausted(): Promise<boolean> {
    for (const guard of this.harness.guards) {
      const exhausted = (guard as { exhausted?: (run: Run) => Promise<boolean> }).exhausted;
      if (exhausted && (await exhausted(this))) return true;
    }
    return false;
  }

  /** Tools the task could ever use (its ceiling). Tools without a permission always count. */
  async allowedTools(names: string[] = this.toolNames): Promise<string[]> {
    const { ceiling } = await this.whoami();
    const allowed = names.filter((n) => {
      if (this.humanToolNames.includes(n)) return true;
      const permission = this.harness.spec(n).permission;
      return !permission || ceiling.includes(permission);
    });
    return Array.from(new Set([...allowed, ...this.humanToolNames]));
  }

  // ── Vercel AI SDK (v7) ──

  /**
   * Tools the model calls to bring the person in (verify, pass on a code,
   * check a push or an approval, whoami). Pass `jsonSchema` from "ai".
   */
  humanTools(jsonSchema: JsonSchemaFn, options: { methods?: string[] } = {}) {
    return humanTools(this, jsonSchema, options);
  }

  /** Wrap AI SDK tools: guards run before each call, after-guards on the result. */
  tools<T extends Record<string, any>>(tools: T): T {
    return aiSdkTools(this, tools);
  }

  /** For `toolApproval`: verify and confirm become 'user-approval'; deny and guide become 'denied' with the reason. */
  get toolApproval(): (options: { toolCall: { toolName: string; toolCallId: string; input: unknown }; messages?: unknown[] }) => Promise<AiSdkApprovalStatus> {
    return aiSdkToolApproval(this);
  }

  /** For `prepareStep`: hides tools outside the task's ceiling from the model. */
  get prepareStep() {
    return aiSdkPrepareStep(this);
  }

  /** For `stopWhen`: stops the loop when the run's call or spend budget is used up. */
  get budgetExceeded() {
    return async (_options?: unknown) => this.budgetExhausted();
  }
}
