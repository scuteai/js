import { AgentSession, SessionOptions } from "./Session";
import {
  ANONYMOUS,
  Decision,
  GenerationInput,
  GuardResult,
  GuardSpan,
  Identity,
  RunInput,
  ScoreInput,
  ToolDefinition,
  TraceSink,
  VerifierAdapter,
} from "./types";

export interface AgentGuardOptions {
  verifier: VerifierAdapter;
  sink?: TraceSink;
  /** unknown / unruled action => deny. Defaults to true. */
  failClosed?: boolean;
  /** injectable clock (tests) */
  now?: () => number;
  /** injectable id generator (tests) */
  genId?: () => string;
}

function makeDefaultGenId(): () => string {
  let n = 0;
  return () => `gs_${Date.now().toString(36)}_${(n++).toString(36)}`;
}

/**
 * The gate. Wraps an agent's tool calls so each is identified (via the
 * verifier / Scute RBAC), authorized, optionally challenge-gated, and traced
 * before it runs. The same logic is hosted at /agents/:id/guard (ticket A03).
 */
export class AgentGuard {
  private verifier: VerifierAdapter;
  private sink?: TraceSink;
  private failClosed: boolean;
  private now: () => number;
  private genId: () => string;
  private tools = new Map<string, ToolDefinition>();
  private callBindings = new Map<string, Identity>();

  constructor(opts: AgentGuardOptions) {
    this.verifier = opts.verifier;
    this.sink = opts.sink;
    this.failClosed = opts.failClosed !== false; // default true
    this.now = opts.now || (() => Date.now());
    this.genId = opts.genId || makeDefaultGenId();
  }

  /** Register a gated tool. Returns a callable that authorizes then runs it. */
  tool<A, R>(def: ToolDefinition<A, R>) {
    this.tools.set(def.name, def as ToolDefinition);
    return (
      args: A,
      opts?: { actor?: string | Identity; traceId?: string }
    ): Promise<GuardResult> =>
      this.run({
        actor: opts?.actor ?? ANONYMOUS,
        action: def.name,
        args,
        traceId: opts?.traceId,
      });
  }

  /** Bind a (phone) call to a verified identity. Used by the verify_caller flow. */
  bindCall(callId: string, identity: Identity): void {
    this.callBindings.set(callId, identity);
  }

  identityForCall(callId: string): Identity {
    return this.callBindings.get(callId) || ANONYMOUS;
  }

  /** The gate. */
  async run(input: RunInput): Promise<GuardResult> {
    const startedAt = this.now();
    const traceId = input.traceId || this.genId();
    const identity = await this.resolveActor(input.actor);
    const def = this.tools.get(input.action);
    const requiredPermission = input.permission ?? def?.permission;

    const span: GuardSpan = {
      traceId,
      sessionId: input.sessionId,
      type: "tool",
      action: input.action,
      args: input.args,
      identity: { kind: identity.kind, id: identity.id, roles: identity.roles },
      requiredPermission,
      decision: "blocked_no_rule",
      startedAt,
    };

    // 1. no rule -> fail closed (or allow if explicitly opened)
    if (!requiredPermission) {
      if (this.failClosed) return this.deny(span, "blocked_no_rule", startedAt);
      return this.allow(span, def, input.args, identity, startedAt);
    }

    // Authoritative fast-path: if the verifier can decide in one call and we have
    // the raw token, use it (covers RBAC + verification gate + M2M escalation).
    const rawToken = typeof input.actor === "string" ? input.actor : undefined;
    if (rawToken && this.verifier.authorize) {
      const d = await this.verifier.authorize(rawToken, requiredPermission);
      if (d.allowed) {
        // Gated + M2M -> escalate to human approval rather than allowing.
        if (d.requiresVerification && identity.kind === "m2m") {
          return this.deny(span, "approval_required", startedAt);
        }
        return this.allow(span, def, input.args, identity, startedAt);
      }
      if (d.requiresVerification) {
        if (identity.kind === "m2m") return this.deny(span, "approval_required", startedAt);
        const res = await this.deny(span, "needs_challenge", startedAt);
        res.challenge = { method: d.verificationMethod };
        return res;
      }
      return this.deny(span, "blocked_rbac", startedAt);
    }

    // 2. RBAC
    if (!(await this.verifier.can(identity, requiredPermission))) {
      return this.deny(span, "blocked_rbac", startedAt);
    }

    // 3. verification gate
    const meta = await this.verifier.permissionMeta(
      identity.appId,
      requiredPermission
    );
    if (meta && meta.requiresVerification) {
      // M2M actors can't do user step-up; escalate to human approval (ticket A09)
      if (identity.kind === "m2m") {
        return this.deny(span, "approval_required", startedAt);
      }
      const verified = this.verifier.isVerified
        ? await this.verifier.isVerified(identity, requiredPermission)
        : false;
      if (!verified) {
        const res = await this.deny(span, "needs_challenge", startedAt);
        res.challenge = { method: meta.method };
        return res;
      }
    }

    // 4. allowed -> execute the registered tool if present
    return this.allow(span, def, input.args, identity, startedAt);
  }

  /** Wrap any async unit of work as a traced `function` span. */
  async traced<R>(
    name: string,
    fn: () => Promise<R> | R,
    ctx?: { sessionId?: string; traceId?: string }
  ): Promise<R> {
    const startedAt = this.now();
    const traceId = ctx?.traceId || this.genId();
    try {
      const result = await fn();
      await this.emit({
        traceId,
        sessionId: ctx?.sessionId,
        type: "function",
        action: name,
        identity: { kind: "anonymous", roles: [] },
        decision: "allowed",
        startedAt,
        durationMs: this.now() - startedAt,
        result,
      });
      return result;
    } catch (e) {
      await this.recordError({
        action: name,
        error: e instanceof Error ? e.message : String(e),
        sessionId: ctx?.sessionId,
        traceId,
      });
      throw e;
    }
  }

  /** Open a session (groups traces over time for one user / one call). */
  session(opts: SessionOptions): AgentSession {
    return new AgentSession(
      this,
      opts.sessionId || this.genId(),
      opts.actor,
      this.genId(),
      opts.replaySessionId
    );
  }

  /** Generate an id using the (injectable) generator. */
  newId(): string {
    return this.genId();
  }

  /** Record a single LLM call as a `generation` span (model, tokens, cost). */
  async recordGeneration(g: GenerationInput): Promise<void> {
    const id = g.identity;
    await this.emit({
      traceId: g.traceId || this.genId(),
      sessionId: g.sessionId,
      type: "generation",
      action: g.model,
      identity: id
        ? { kind: id.kind, id: id.id, roles: id.roles }
        : { kind: "anonymous", roles: [] },
      decision: "allowed",
      startedAt: this.now(),
      durationMs: g.latencyMs,
      model: g.model,
      inputTokens: g.inputTokens,
      outputTokens: g.outputTokens,
      costUsd: g.costUsd,
    });
  }

  /** Record an error span, shown next to the call that caused it. */
  async recordError(e: {
    action: string;
    error: string;
    sessionId?: string;
    traceId?: string;
  }): Promise<void> {
    await this.emit({
      traceId: e.traceId || this.genId(),
      sessionId: e.sessionId,
      type: "error",
      action: e.action,
      identity: { kind: "anonymous", roles: [] },
      decision: "allowed_downstream_error",
      startedAt: this.now(),
      error: e.error,
    });
  }

  /** Record a score: sentiment, quality, groundedness (source: "auto"/"human"). */
  async recordScore(s: ScoreInput): Promise<void> {
    await this.emit({
      traceId: s.traceId || this.genId(),
      sessionId: s.sessionId,
      type: "score",
      action: s.name,
      identity: { kind: "anonymous", roles: [] },
      decision: "allowed",
      startedAt: this.now(),
      scoreName: s.name,
      score: s.value,
      source: s.source || "auto",
      comment: s.comment,
    });
  }

  /** Collect end-user feedback (thumbs up/down + optional comment) as a score. */
  async recordFeedback(f: {
    value: number;
    comment?: string;
    sessionId?: string;
    traceId?: string;
  }): Promise<void> {
    await this.recordScore({
      name: "user_feedback",
      value: f.value,
      source: "user",
      comment: f.comment,
      sessionId: f.sessionId,
      traceId: f.traceId,
    });
  }

  private async resolveActor(actor: string | Identity): Promise<Identity> {
    if (typeof actor === "string") {
      try {
        return await this.verifier.resolveIdentity(actor);
      } catch {
        return ANONYMOUS;
      }
    }
    return actor || ANONYMOUS;
  }

  private async deny(
    span: GuardSpan,
    decision: Decision,
    startedAt: number
  ): Promise<GuardResult> {
    span.decision = decision;
    span.durationMs = this.now() - startedAt;
    await this.emit(span);
    return { decision, allowed: false, span };
  }

  private async allow(
    span: GuardSpan,
    def: ToolDefinition | undefined,
    args: unknown,
    identity: Identity,
    startedAt: number
  ): Promise<GuardResult> {
    span.decision = "allowed";
    let result: unknown;
    try {
      if (def) result = await def.run(args, { identity });
      span.result = result;
    } catch (e) {
      span.decision = "allowed_downstream_error";
      span.error = e instanceof Error ? e.message : String(e);
      span.durationMs = this.now() - startedAt;
      await this.emit(span);
      return { decision: span.decision, allowed: true, span };
    }
    span.durationMs = this.now() - startedAt;
    await this.emit(span);
    return { decision: "allowed", allowed: true, span, result };
  }

  private async emit(span: GuardSpan): Promise<void> {
    if (this.sink) await this.sink.record(span);
  }
}
