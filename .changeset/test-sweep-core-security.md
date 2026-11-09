---
"@scute/js-core": minor
---

Security and session fixes from the test-suite sweep.

- `ScuteLocalAuthz` verifies the policy snapshot's RS256 signature against the app's JWKS (audience, type, expiry) before deciding from it, and asks the API when there is no verified snapshot, it is past `exp`, or it is older than `maxStaleMs` (new option; default 5 × `refreshMs`, at least 60s). New `ScuteAdminApi.authzJwks()` and `verifiedAuthzSnapshot()`.
- Only idempotent requests (GET, HEAD, DELETE) are retried; POST/PUT/PATCH are sent once. A 204/205 answer is a success with `data: null`.
- `verifyMagicLinkToken(token, url?)` and the sct_sk path: the sign-in result is checked (its error is returned), `signInWithMagicLinkToken` signs in once, sct_sk/sct_oauth are read from the given url, and nothing throws outside a browser (`getMagicLinkToken()` returns null there).
- `beginImpersonation` keeps the support person's tokens HttpOnly on the server and restores the own session when the session as the user is refused.
- Auth events and the cross-tab channel never carry the refresh token; an inbound cross-tab event's session and user are read again, not trusted.
- Session cookies are Secure by default (an adapter's own `secure` wins; plain-http localhost pages go without).
- A legacy unsuffixed session token is migrated, or deleted on sign-out, only when its claims name this app (`aud`, `app_id` or `appId`).
- `autoRefreshToken: false` is no longer overridden by the app's `auto_refresh`; with auto refresh off an expired session is not reported or sent upstream; an expiring browser session with nothing to refresh with emits `SIGNED_OUT`; a failed app-data load at construction is retried on the next call; `TOKEN_REFRESHED` is emitted after the new tokens are saved, with the session; `getAuthToken()` refreshes first and never returns an expired token.
- `signOut()` revokes with the stored token when the pre-signout refresh fails transiently, and returns false when the server could not be told.
- `cancelChallenge` clears the pending sign-in MFA challenge it cancels.
- Tokens with a non-numeric `exp` are refused; `isMaybePhoneNumber` needs a digit; `addDevice` returns an error (not a rejection) when registration options are missing; `getMeaningfulError` falls back to the generic message.
- New export `SESSION_EVENTS`.
