import { GuardSpan, TraceSink } from "../types";

/** Logs a one-line summary per decision. For local dev. */
export class ConsoleSink implements TraceSink {
  record(span: GuardSpan): void {
    const who =
      span.identity.kind +
      (span.identity.id ? ":" + span.identity.id : "");
    // eslint-disable-next-line no-console
    console.log(
      `[agent-guard] ${span.decision} ${span.action} actor=${who} perm=${
        span.requiredPermission ?? "-"
      }`
    );
  }
}
