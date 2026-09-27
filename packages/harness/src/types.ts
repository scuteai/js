import type { Run } from "./run";

/** How a guard's answer counts: recorded only, recorded and alerted on, or acted on. */
export type Mode = "observe" | "monitor" | "enforce";

/** How much a tool can hurt. Set per tool in `tools`; defaults to "low". */
export type Tier = "low" | "medium" | "high";

/**
 * What a guard wants done with a tool call, least to most strict:
 * proceed, transform (run with other arguments), approve (someone confirms),
 * verify (the person proves it's them), guide (don't run; tell the model
 * what to do instead), redirect (use something else), deny.
 */
export type DecisionKind = "proceed" | "transform" | "approve" | "verify" | "guide" | "redirect" | "deny";

/** A decision from Scute's engine (POST /v1/auth/:app_id/agent/check). */
export type EngineDecision = {
  decision: "allow" | "deny" | "allow_with_step_up" | "allow_with_approval";
  allowed: boolean;
  reason: string;
  permission?: string;
  roles?: string[];
  conditions?: string[];
  step_up?: { method: string; ttl?: number; authorizes_action: string; error?: string; detail?: string };
  approval?: { permission?: string; resource?: string; error?: string };
  agent?: { agent: string; task: string; chain: string[]; roles: string[] };
  explanation?: string;
  /** A line for the person, when the answer isn't a plain allow. */
  say?: string;
};

export type Decision = {
  kind: DecisionKind;
  /** A short code for logs and tests: "outside_task", "ungrounded", "budget_exhausted"... */
  reason?: string;
  /** Words for the model (guide, deny, redirect) or for the person (verify, approve). */
  message?: string;
  /** A line for the person (voice or chat), when there's something to tell them. */
  say?: string;
  /** transform: the arguments the tool runs with instead. */
  args?: Record<string, unknown>;
  /** From an after-guard: what the model sees instead of the tool's result. */
  result?: unknown;
  verify?: { methods?: string[]; method?: string; permission?: string };
  /**
   * `user`: the person the agent works for confirms (your chat UI's approve
   * button). `reviewer`: someone else approves (a Scute access request).
   */
  approve?: { by: "user" | "reviewer"; requestId?: string };
  redirect?: { to: string };
  engine?: EngineDecision;
};

export type Resource = { type: string; key?: string; attributes?: Record<string, unknown> };

export type Args = Record<string, unknown>;

/**
 * A guard looks at a tool call before it runs, its result after, or both,
 * and returns a decision. Returning nothing means proceed. A guard that
 * throws counts as deny when enforced (fail closed).
 */
export interface Guard {
  name: string;
  /** Overrides the harness mode for this guard. */
  mode?: Mode;
  /** Evaluate after the other guards (for guards that spend single-use proofs). */
  runsLast?: boolean;
  before?(call: ToolCall): Decision | void | Promise<Decision | void>;
  after?(call: ToolCall, result: unknown): Decision | void | Promise<Decision | void>;
}

/** How one tool maps to Scute. Everything is optional; names follow the convention. */
export type ToolConfig = {
  /** The permission this tool needs. Default: refund_invoice -> "invoice:refund". `false`: none. */
  permission?: string | false;
  tier?: Tier;
  /** The argument that names the object (default: `<type>_id`, `<type>Id`, then `id`). */
  key?: string;
  /**
   * The object's attributes for policy conditions, from the arguments. Off
   * by default: arguments go to the engine as `context.args`, and attributes
   * Scute stores for the object always win over these.
   */
  attributes?: (args: Args) => Record<string, unknown>;
  /** Build the resource yourself. */
  resource?: (args: Args) => Resource | undefined;
};

export type ToolsConfig = Record<string, ToolConfig | false>;

export type ToolSpec = {
  name: string;
  /** null: no permission check for this tool. */
  permission: string | null;
  /** What the engine gets as `action` ("refund" for "invoice:refund"). */
  action: string | null;
  resourceType?: string;
  tier: Tier;
  resource(args: Args): Resource | undefined;
};

/** A tool call as guards see it, with helpers to answer. */
export interface ToolCall {
  readonly id: string;
  readonly tool: string;
  /** The arguments, after any earlier guard's transform. */
  readonly args: Args;
  readonly spec: ToolSpec;
  readonly permission: string | null;
  readonly tier: Tier;
  readonly resource: Resource | undefined;
  /** The conversation so far, when the framework hands it over. */
  readonly messages: unknown[];
  /** The person confirmed this exact call (e.g. an AI SDK approval response). */
  readonly approvedByUser: boolean;
  /** The mode of the guard looking at the call. Side effects (sending a push, filing a request) belong in enforce only. */
  readonly mode: Mode;
  /** No guard so far stops the call: the moment to spend single-use proofs (an approval, a challenge). */
  readonly clear: boolean;
  readonly run: Run;
  proceed(): Decision;
  deny(message: string, reason?: string): Decision;
  guide(message: string, reason?: string): Decision;
  verify(message?: string, options?: Decision["verify"]): Decision;
  approve(message?: string): Decision;
  transform(args: Args, message?: string): Decision;
  redirect(to: string, message?: string): Decision;
}

/** One guard's answer, as recorded. */
export type GuardResult = {
  guard: string;
  mode: Mode;
  decision: Decision;
  error?: unknown;
};

/** The harness's answer for one call: the strictest enforced decision, and every guard's opinion. */
export type Verdict = {
  kind: DecisionKind;
  decision: Decision & { guard?: string };
  /** The arguments to run with (transforms applied). */
  args: Args;
  /** What to tell the model when the call doesn't run. */
  message?: string;
  /** What to tell the person, when there's something to tell them. */
  say?: string;
  results: GuardResult[];
  callId: string;
  tool: string;
};

export type DecisionEvent = {
  run: string;
  agent: string;
  tool: string;
  callId: string;
  phase: "before" | "after";
  kind: DecisionKind;
  guard?: string;
  reason?: string;
  message?: string;
  results: GuardResult[];
  ms: number;
};

export type AlertEvent = {
  run: string;
  agent: string;
  tool: string;
  callId: string;
  phase: "before" | "after";
  guard: string;
  decision: Decision;
};

/** Where run state lives between requests. Use Redis, KV or a table in serverless apps. */
export interface Store {
  get(key: string): Promise<string | null | undefined>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
}
