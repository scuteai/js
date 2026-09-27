import { ScuteClient } from "./client";
import { toolSpec } from "./convention";
import { Call, modelMessage, rank, runs } from "./decisions";
import { permissions } from "./guards/permissions";
import { Run, type RunOptions } from "./run";
import { memoryStore } from "./store";
import type { AlertEvent, Decision, DecisionEvent, Guard, GuardResult, Mode, Store, Tier, ToolsConfig, ToolSpec, Verdict } from "./types";

export type HarnessConfig = {
  /** The agent's slug in Scute (registered under Authorization > Agents, or by API). */
  agent: string;
  /** Default: SCUTE_APP_ID. */
  appId?: string;
  /** Default: SCUTE_SECRET. Needed to start tasks; an agent handed a task token can run without it. */
  secret?: string;
  /** Default: SCUTE_BASE_URL, then https://api.scute.io. */
  baseUrl?: string;
  /** For every guard that doesn't set its own. Default "enforce". */
  mode?: Mode;
  /** Checked in order; the strictest enforced answer wins. Default: [guards.permissions()]. */
  guards?: Guard[];
  /** Per-tool mapping, where the naming convention isn't enough. */
  tools?: ToolsConfig;
  /** Tier for tools that don't set one. Default "low". */
  defaultTier?: Tier;
  /** Where run state lives between requests. Default: in memory. */
  store?: Store;
  /** Every decision, for your logs or traces. */
  onDecision?: (event: DecisionEvent) => void;
  /** A guard in monitor mode would have stopped something. */
  onAlert?: (event: AlertEvent) => void;
  fetch?: typeof fetch;
};

const env = (name: string): string | undefined =>
  typeof process !== "undefined" && process.env ? process.env[name] || undefined : undefined;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const PROCEED: Decision = { kind: "proceed" };

export class Harness {
  readonly agent: string;
  readonly mode: Mode;
  readonly guards: Guard[];
  readonly store: Store;
  readonly client: ScuteClient;
  private readonly specs = new Map<string, ToolSpec>();

  constructor(private readonly config: HarnessConfig) {
    const appId = config.appId ?? env("SCUTE_APP_ID");
    if (!config.agent) throw new Error("createHarness needs `agent`: the agent's slug in Scute");
    if (!appId) throw new Error("createHarness needs an app id: pass `appId` or set SCUTE_APP_ID");
    const fetchImpl = config.fetch ?? (typeof fetch !== "undefined" ? fetch : undefined);
    if (!fetchImpl) throw new Error("No fetch available; pass `fetch` (Node 18+ has one built in)");

    this.agent = config.agent;
    this.mode = config.mode ?? "enforce";
    this.guards = config.guards ?? [permissions()];
    this.store = config.store ?? memoryStore();
    this.client = new ScuteClient({
      appId,
      secret: config.secret ?? env("SCUTE_SECRET"),
      baseUrl: (config.baseUrl ?? env("SCUTE_BASE_URL") ?? "https://api.scute.io").replace(/\/+$/, ""),
      fetch: fetchImpl,
    });
  }

  /** Start (or resume, with the same `id`) a job for the agent. */
  run(options: RunOptions = {}): Run {
    return new Run(this, options);
  }

  /** How a tool maps to Scute: permission, object, tier. */
  spec(tool: string): ToolSpec {
    let spec = this.specs.get(tool);
    if (!spec) {
      spec = toolSpec(tool, this.config.tools, this.config.defaultTier ?? "low");
      this.specs.set(tool, spec);
    }
    return spec;
  }

  private modeOf(guard: Guard): Mode {
    return guard.mode ?? this.mode;
  }

  /** @internal before-guards, strictest enforced decision wins. */
  async evaluate(call: Call): Promise<Verdict> {
    const started = now();
    const results: GuardResult[] = [];
    let winner: Decision & { guard?: string } = PROCEED;

    for (const guard of this.guards) {
      if (!guard.before) continue;
      const mode = this.modeOf(guard);
      call.mode = mode;
      let decision: Decision;
      let error: unknown;
      try {
        decision = (await guard.before(call)) || PROCEED;
      } catch (e) {
        error = e;
        decision = { kind: "deny", reason: "guard_error", message: "This action couldn't be checked safely right now." };
      }
      results.push(error === undefined ? { guard: guard.name, mode, decision } : { guard: guard.name, mode, decision, error });

      if (mode !== "enforce") {
        if (mode === "monitor" && decision.kind !== "proceed") this.alert(call, "before", guard.name, decision);
        continue;
      }
      if (decision.kind === "transform" && decision.args) call.args = { ...decision.args };
      if (rank(decision.kind) > rank(winner.kind)) winner = { ...decision, guard: guard.name };
      if (decision.kind === "deny") break;
    }

    const verdict: Verdict = { kind: winner.kind, decision: winner, args: call.args, results, callId: call.id, tool: call.tool };
    if (!runs(verdict)) verdict.message = modelMessage(verdict, { humanTools: call.run.humanToolNames.length > 0 });
    const say = winner.say ?? winner.engine?.say;
    if (say) verdict.say = say;
    if (verdict.kind === "verify") call.run.lastVerify = winner.verify;
    this.emit(call, "before", verdict.kind, winner, results, started);
    return verdict;
  }

  /** @internal after-guards: transform or withhold a result. */
  async evaluateAfter(call: Call, result: unknown): Promise<{ result: unknown; results: GuardResult[] }> {
    const started = now();
    const results: GuardResult[] = [];
    let current = result;
    let winner: Decision & { guard?: string } = PROCEED;

    for (const guard of this.guards) {
      if (!guard.after) continue;
      const mode = this.modeOf(guard);
      call.mode = mode;
      let decision: Decision;
      let error: unknown;
      try {
        decision = (await guard.after(call, current)) || PROCEED;
      } catch (e) {
        error = e;
        decision = { kind: "deny", reason: "guard_error", message: "This result couldn't be checked safely, so it was withheld." };
      }
      results.push(error === undefined ? { guard: guard.name, mode, decision } : { guard: guard.name, mode, decision, error });

      if (mode !== "enforce") {
        if (mode === "monitor" && decision.kind !== "proceed") this.alert(call, "after", guard.name, decision);
        continue;
      }
      if (decision.kind === "proceed") continue;
      if (rank(decision.kind) > rank(winner.kind)) winner = { ...decision, guard: guard.name };
      if ("result" in decision) {
        current = decision.result;
      } else if (rank(decision.kind) >= rank("guide")) {
        current = { error: decision.message ?? "This result was withheld." };
      }
      if (decision.kind === "deny") break;
    }

    this.emit(call, "after", winner.kind, winner, results, started);
    return { result: current, results };
  }

  private emit(call: Call, phase: "before" | "after", kind: Verdict["kind"], winner: Decision & { guard?: string }, results: GuardResult[], started: number) {
    if (!this.config.onDecision) return;
    try {
      this.config.onDecision({
        run: call.run.id,
        agent: this.agent,
        tool: call.tool,
        callId: call.id,
        phase,
        kind,
        guard: winner.guard,
        reason: winner.reason,
        message: winner.message,
        results,
        ms: Math.round((now() - started) * 100) / 100,
      });
    } catch {
      // A logging hook must never change a decision.
    }
  }

  private alert(call: Call, phase: "before" | "after", guard: string, decision: Decision) {
    try {
      this.config.onAlert?.({ run: call.run.id, agent: this.agent, tool: call.tool, callId: call.id, phase, guard, decision });
    } catch {
      // As above.
    }
  }

  /** @internal hourly execution log, per agent and person. */
  async recordExecution(key: string, tier: Tier) {
    const recent = await this.executions(key, 3600_000);
    recent.push({ at: Date.now(), tier });
    await this.store.set(key, JSON.stringify(recent), 3600);
  }

  /** @internal */
  async executions(key: string, windowMs: number): Promise<{ at: number; tier: Tier }[]> {
    const raw = await this.store.get(key);
    const since = Date.now() - windowMs;
    return raw ? (JSON.parse(raw) as { at: number; tier: Tier }[]).filter((e) => e.at > since) : [];
  }
}

/**
 * The harness around your agent: guards that decide on each tool call,
 * backed by Scute's engine for who may do what.
 *
 * ```ts
 * const harness = createHarness({ agent: "support-bot", guards: [guards.permissions()] });
 * const run = harness.run({ actsFor: user.id });
 * ```
 */
export function createHarness(config: HarnessConfig): Harness {
  return new Harness(config);
}
