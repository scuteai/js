// Confirmed findings from running this suite against the v2 API. A test that
// hits one records it and stops (it passes while the bug reproduces); once
// the bug is fixed the test fails with "no longer reproduces", so whoever
// fixed it turns the check back into a plain assertion. Everything else in
// the suite fails as usual, so the run is green except for regressions.

export type Finding = { id: string; title: string };

export const FINDINGS = {
  // F1 to F6 were fixed in api#134 (scute-api-v2 v23) and js#41; their tests now assert the fixed behavior.
  otpSignInUndeletes: {
    id: "F8",
    title:
      "POST /v1/auth/:app_id/otps/login (sendLoginOtp, signIn) brings a deleted user back: the same user id answers " +
      "404 before and 200 after, with the old account's data (the identifier lookup no longer does this)",
  },
  signUpCantSeeAccounts: {
    id: "F9",
    title:
      "ScuteClient.signUp checks email_verified / phone_verified on the identifier lookup, which answers only id, status, " +
      "webauthn_enabled and the identifier now, so an existing account gets a registration code instead of " +
      "IdentifierAlreadyExistsError",
  },
  getUserByUserIdBroken: {
    id: "F10",
    title:
      "ScuteAdminApi.getUserByUserId asks GET /v1/auth/:app_id/users?user_id=, which only takes an identifier: " +
      "400 invalid_identifier",
  },
} satisfies Record<string, Finding>;

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
