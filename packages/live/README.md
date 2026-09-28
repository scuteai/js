# @scute/live-tests

The JS SDKs against a real Scute API: real HTTP, no mocks. It runs on demand
(`pnpm test:live`), never in CI, and skips every test with one line saying
why when it has no credentials.

It follows the DX-08 contract shared with the Ruby and Python suites: test
identities that always get the code `424242`, one app per suite, everything
it makes named `live-<runid>-...` and deleted at the end (even when a test
fails), a handful of sign-ins per run, and no secret, token or code other
than `424242` in the output.

## What it covers

| DX-08 | What runs |
| --- | --- |
| 1. App | `ScuteClient.getAppData`, `ScuteAdminApi.getAppData` |
| 2. Sign-in | email OTP (`signIn`, `verifyOtp`, `signInWithTokenPayload`), SMS OTP (`sendLoginOtp`), `getUser`, `refreshSession`, `listUserSessions`, `revokeSession`, admin `listUserSessions` / `revokeUserSession`, `signOut` |
| 3. Tokens | the remote check (`getUser` with a good and a tampered token). Local JWKS verification of a session token is skipped: the SDKs have no API for it. Local verification is covered where the SDKs have it: `verifySnapshotToken` (tampered, expired, other app) and `@scute/mcp-gateway` `verifyAccessToken` (tampered, expired, other audience or issuer) |
| 4. MFA | `enrollMfa` TOTP (the code computed from the secret, RFC 6238 with `node:crypto`), `verifyMfaEnrollment`, `listMfaMethods`, `getMfaStatus`, `generateBackupCodes`, a sign-in that then needs MFA finished with `verifyMfaChallenge` (TOTP) and with a backup code (`switchMfaMethod`), `removeMfaMethod` with the completed challenge. With `SCUTE_LIVE_SLOW=1` it also waits out the re-verify window (over 5 minutes) and checks `needsReverification` |
| 5. Admin users | `createUser`, `getUser`, `getUserByIdentifier`, `listUsers`, `updateUser`, `deactivateUser`, `activateUser`, `deleteUser` |
| 6. Impersonation | `impersonateUser` (the `act` claim), `listImpersonations`, `beginImpersonation` / `getImpersonation` / `stopImpersonating` in the client, a "not while impersonating" permission denied inside the session (`authz.can`) and from the backend (`impersonationContext`), admin `stopImpersonating` |
| 7. Authz | policy import (dry run, apply, idempotent), roles assigned and removed, `authzCheck`, `authzCheckBatch`, `authzUserPermissions`, `authzAuthorizedUsers`, `authzFilter`, a step-up redeemed (`authzStartStepUp`), `authz.can` / `canMany` / `permissions` / `reviews`, `authzSnapshot`, local decisions matching the server over a matrix (`ScuteLocalAuthz`, `decideLocally`), access requests (`requestAccess`, `myRequests`, `cancelRequest`, `authzRequests`, `authzCreateRequest`, `authzDecideRequest`, an approval spent once) |
| 8. Agents | `@scute/harness`: register agents, mint a task (`run.whoami`, `run.taskId`), `run.check` allow and deny outside the task, step-up with human steps (`startVerification`, `submitCode` 424242), a reviewer approval for the exact call, `run.property` and `run.sign` (the JWS verified with the property's JWKS), a budget of 2 that pauses the agent on the 3rd action and closes the run, suspend and resume, `run.complete` |
| 9. Auth MCP | JSON-RPC over fetch with an agent key (`createAgentKey`): `initialize`, `tools/list`, `scute_identify` (test email and conversation id), `scute_submit_code` 424242, `scute_whoami`, `scute_check`, then `agentConversation` and `agentConversationCheck`, and the refusal once the conversation ends |
| MCP gateway | `@scute/mcp-gateway` in this process in front of an in-process MCP server (no port): OAuth 2.1 with PKCE to get the user's access token, protected resource metadata, `tools/list` filtered by the task, `tools/call` allowed, refused, and verified through the gateway's own tools |
| 10. Decision log | rows for the checks above: backend, client, agent, auth MCP, conversation, impersonated |

`@scute/nextjs-handlers` and `@scute/react-hooks` aren't here: they need a
Next.js runtime or a DOM, and they are thin layers over `@scute/js-core`,
which is.

API calls the SDKs have no method for (registering agents, importing a
policy, assigning roles, properties, settings, the OAuth server, the decision
log, finishing a challenge from the backend) go through a small typed fetch
helper (`src/lib/http.ts`) with the app secret; each call site says which
method is missing.

## Credentials

The suite needs its own app, in the "SDK live tests" workspace, with test
identities on. On the v2 API (deployed with `SCUTE_TEST_IDENTITIES=enabled`):

```sh
heroku run -a scute-api-v2 rake "sdk_live:setup[js]"
```

It prints three lines. Put them in `_devshop/.sdk-live/js.env` (outside
every repo; never commit it):

```sh
SCUTE_LIVE_BASE_URL=...
SCUTE_LIVE_APP_ID=...
SCUTE_LIVE_SECRET=...
```

The suite reads `SCUTE_LIVE_*` from the environment first, then from that
file. `SCUTE_LIVE_ENV_FILE=/path/to/file` points it at another file.

## Run

From the repo root:

```sh
pnpm test:live                    # builds js-core, harness and mcp-gateway, then runs the suite
SCUTE_LIVE_SLOW=1 pnpm test:live  # also the tests that wait out real time windows (5+ minutes)
pnpm --filter @scute/live-tests typecheck
```

A run takes a couple of minutes (the TOTP steps wait for a fresh 30 second
window, and the decision log is written by a background job). The tests run
in order in one file (`src/scute.live.ts`); a test that needs something an
earlier one failed to make is skipped with a note saying what it needed.

The suite turns on what it tests in its own app. Client checks, access
requests, impersonation and logging every allow stay on; the OAuth server
setting and the MFA policy go back to how they were at the end.
