import type { AgentGuard } from "./AgentGuard";
import { GenerationInput, GuardResult, Identity, ScoreInput } from "./types";

export interface SessionOptions {
  actor: string | Identity;
  sessionId?: string;
  /** link to a session-replay recording (e.g. PostHog/LiveKit recording id) */
  replaySessionId?: string;
}

/**
 * Groups traces over time for one actor (one user / one call). Each turn is a
 * trace; tool / generation / function / error / score spans nest under it.
 * Mirrors PostHog's session -> trace -> span hierarchy, with identity + RBAC
 * decisions attached to tool spans.
 */
export class AgentSession {
  readonly replaySessionId?: string;

  constructor(
    private guard: AgentGuard,
    public readonly sessionId: string,
    private actor: string | Identity,
    private traceId: string,
    replaySessionId?: string
  ) {
    this.replaySessionId = replaySessionId;
  }

  get currentTraceId(): string {
    return this.traceId;
  }

  /** Start a new trace (a new turn) within this session. */
  newTurn(traceId?: string): this {
    this.traceId = traceId || this.guard.newId();
    return this;
  }

  /** Gate + run a tool within the current turn. */
  run(action: string, args?: unknown, permission?: string): Promise<GuardResult> {
    return this.guard.run({
      actor: this.actor,
      action,
      args,
      permission,
      sessionId: this.sessionId,
      traceId: this.traceId,
    });
  }

  traced<R>(name: string, fn: () => Promise<R> | R): Promise<R> {
    return this.guard.traced(name, fn, {
      sessionId: this.sessionId,
      traceId: this.traceId,
    });
  }

  recordGeneration(
    g: Omit<GenerationInput, "sessionId" | "traceId">
  ): Promise<void> {
    return this.guard.recordGeneration({
      ...g,
      sessionId: this.sessionId,
      traceId: this.traceId,
    });
  }

  recordError(action: string, error: string): Promise<void> {
    return this.guard.recordError({
      action,
      error,
      sessionId: this.sessionId,
      traceId: this.traceId,
    });
  }

  recordScore(s: Omit<ScoreInput, "sessionId" | "traceId">): Promise<void> {
    return this.guard.recordScore({
      ...s,
      sessionId: this.sessionId,
      traceId: this.traceId,
    });
  }

  recordFeedback(value: number, comment?: string): Promise<void> {
    return this.guard.recordFeedback({
      value,
      comment,
      sessionId: this.sessionId,
      traceId: this.traceId,
    });
  }
}
