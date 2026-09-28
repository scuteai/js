// Confirmed findings from running this suite against the v2 API. A test that
// hits one records it and stops (it passes while the bug reproduces); once
// the bug is fixed the test fails with "no longer reproduces", so whoever
// fixed it turns the check back into a plain assertion. Everything else in
// the suite fails as usual, so the run is green except for regressions.

export type Finding = { id: string; title: string };

// Nothing open. F1 to F10, found by this suite, are fixed (api#134 to #137 on scute-api-v2, js#41 and
// js#43) and their tests assert the fixed behavior. Add a finding here when a run turns up a new one.
export const FINDINGS = {} satisfies Record<string, Finding>;

type Annotate = (message: string, type?: string) => Promise<unknown>;

/** The findings that reproduced in this run, with each test's evidence (printed at the end). */
export const reproduced = new Map<string, string[]>();

export function reproducedSummary(): string | undefined {
  if (!reproduced.size) return undefined;
  const lines = [...reproduced.entries()].map(([id, evidence]) => `  ${id}: ${evidence.join("; ")}`);
  return `[scute live] known bugs that still reproduce (these tests pass while they do; see src/lib/findings.ts):\n${lines.join("\n")}`;
}

/**
 * Settle a check against a confirmed finding. `reproduces`: the bug showed
 * up (say how in `evidence`, never with a token). While it reproduces the
 * test is noted and the caller stops; once it doesn't, this throws.
 */
export async function knownBug(annotate: Annotate, finding: Finding, reproduces: boolean, evidence: string): Promise<void> {
  if (!reproduces) {
    throw new Error(
      `${finding.id} no longer reproduces: ${finding.title}. It looks fixed; turn this check into a plain assertion and ` +
        `remove it from src/lib/findings.ts.`
    );
  }
  reproduced.set(finding.id, [...(reproduced.get(finding.id) ?? []), evidence]);
  await annotate(`known bug ${finding.id} (still reproduces): ${evidence}`, "notice");
}
