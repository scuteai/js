import { GuardSpan, TraceSink } from "../types";

/** Captures spans in an array. For tests and local inspection. */
export class MemorySink implements TraceSink {
  spans: GuardSpan[] = [];

  record(span: GuardSpan): void {
    this.spans.push(span);
  }

  clear(): void {
    this.spans = [];
  }
}
