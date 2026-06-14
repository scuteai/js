/** Decision returned by the gate for a single action. */
export type Decision =
  | "allowed"
  | "blocked_rbac"
  | "blocked_no_rule"
  | "needs_challenge"
  | "approval_required"
  | "allowed_downstream_error";

/** The actor on whose behalf the agent is acting. */
export interface Identity {
  kind: "user" | "m2m" | "anonymous";
  /** user id or m2m session id */
  id?: string;
  appId?: string;
  roles: string[];
  /** optional pre-resolved permission slugs */
  permissions?: string[];
}

export const ANONYMOUS: Identity = { kind: "anonymous", roles: [] };

/**
 * Span kind, mirroring PostHog/Braintrust AI-observability hierarchy:
 *  - tool:       a gated action (carries the RBAC decision — our addition)
 *  - generation: a single LLM call (model, tokens, cost)
 *  - function:   a non-LLM unit of work (retrieval, routing)
 *  - error:      a failure recorded next to the call that caused it
 */
/**
 *  - tool:       a gated action (carries the RBAC decision — our addition)
 *  - generation: a single LLM call (model, tokens, cost)
 *  - function:   a non-LLM unit of work (retrieval, routing)
 *  - error:      a failure recorded next to the call that caused it
 *  - score:      a derived metric (sentiment, quality, groundedness)
 */
export type SpanType = "tool" | "generation" | "function" | "error" | "score";

/**
 * A single recorded span. Spans roll up into a trace (traceId) which rolls up
 * into a session (sessionId). A `tool` span uniquely carries identity + the
 * RBAC decision — that is what makes this more than observability.
 */
export interface GuardSpan {
  traceId: string;
  /** groups traces over time (per user / per call). PostHog-style session. */
  sessionId?: string;
  type: SpanType;
  action: string;
  args?: unknown;
  identity: { kind: Identity["kind"]; id?: string; roles: string[] };
  requiredPermission?: string;
  decision: Decision;
  result?: unknown;
  error?: string;
  startedAt: number;
  durationMs?: number;
  // generation-only telemetry (token usage + cost)
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  // score-only (sentiment, quality, groundedness, user feedback)
  scoreName?: string;
  score?: number;
  source?: "auto" | "user" | "human";
  comment?: string;
  /** link to a session-replay recording (provider session id) */
  replaySessionId?: string;
}

/** A derived or collected score: sentiment, quality, groundedness, feedback. */
export interface ScoreInput {
  name: string;
  /** 0..1 (or categorical mapped to 0..1) */
  value: number;
  source?: "auto" | "user" | "human";
  comment?: string;
  sessionId?: string;
  traceId?: string;
}

export interface VerificationMeta {
  requiresVerification: boolean;
  method?: string;
}

/**
 * Bridges the gate to Scute RBAC (#18). In production this is backed by the
 * Scute verify/authorize endpoints (ticket A02). In tests, use StubVerifier.
 * Permissions are read LIVE (not from a stale JWT claim) so revocation is instant.
 */
export interface VerifierAdapter {
  resolveIdentity(token: string): Promise<Identity>;
  can(identity: Identity, permission: string): Promise<boolean>;
  permissionMeta(
    appId: string | undefined,
    permission: string
  ): Promise<VerificationMeta | null>;
  /** whether a USER has already satisfied step-up for this permission */
  isVerified?(identity: Identity, permission: string): Promise<boolean>;
}

/** Where trace spans go (console | memory | scute | braintrust | otel | posthog). */
export interface TraceSink {
  record(span: GuardSpan): void | Promise<void>;
}

export interface ToolContext {
  identity: Identity;
}

export interface ToolDefinition<A = any, R = any> {
  name: string;
  /** required permission slug; if omitted, fail-closed treats the action as blocked */
  permission?: string;
  run: (args: A, ctx: ToolContext) => Promise<R> | R;
}

export interface RunInput {
  /** a token string (resolved via the verifier) or an already-resolved Identity */
  actor: string | Identity;
  action: string;
  args?: unknown;
  /** explicit required permission; falls back to the registered tool's permission */
  permission?: string;
  traceId?: string;
  sessionId?: string;
}

/** Telemetry for a single LLM call. */
export interface GenerationInput {
  sessionId?: string;
  traceId?: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs?: number;
  identity?: Identity;
}

export interface GuardResult {
  decision: Decision;
  allowed: boolean;
  span: GuardSpan;
  result?: unknown;
  challenge?: { method?: string };
}
