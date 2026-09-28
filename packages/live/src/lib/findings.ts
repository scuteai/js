// Confirmed findings from running this suite against the v2 API. A test that
// hits one records it and stops (it passes while the bug reproduces); once
// the bug is fixed the test fails with "no longer reproduces", so whoever
// fixed it turns the check back into a plain assertion. Everything else in
// the suite fails as usual, so the run is green except for regressions.

export type Finding = { id: string; title: string };

export const FINDINGS = {
  challengeNeedsApiKey: {
    id: "F1",
    title:
      "ScuteClient's challenge calls (verifyMfaChallenge, switchMfaMethod, ...) hit /v1/auth/:app_id/challenges/*, " +
      "which answers 401 'HTTP Token: Access denied.' without the app's API key, so a browser can't finish an MFA sign-in",
  },
  adminSessionsNeedUserToken: {
    id: "F2",
    title:
      "ScuteAdminApi.listUserSessions and revokeUserSession send the app secret, but /v1/:app_id/users/:id/sessions " +
      "also wants a user session token (X-Authorization): 401 'Not authorized'",
  },
  snapshotAudIsInternalId: {
    id: "F3",
    title:
      "Policy snapshots are signed with aud = the app's internal UUID, so verifySnapshotToken(token, jwks, appId) with the " +
      "app id the SDK is configured with (app_...) rejects every snapshot ('Snapshot is for another app')",
  },
  signInBeforeAppData: {
    id: "F4",
    title:
      "ScuteClient.signIn doesn't wait for the app's config: when it arrives after the identifier lookup, signIn throws " +
      "TypeError (reading 'email_auth_type')",
  },
  phoneLookup500: {
    id: "F5",
    title:
      "Looking a user up by phone queries a column app_users doesn't have: GET /v1/auth/:app_id/mfa/status?identifier=<phone> " +
      "and the auth MCP's scute_identify with a phone answer 500",
  },
  identifierLookupCreatesUsers: {
    id: "F6",
    title:
      "GET /v1/auth/:app_id/users?identifier= (getUserByIdentifier; signIn and verifyOtp use it) creates the user when it " +
      "doesn't exist, and brings back a deleted one",
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
