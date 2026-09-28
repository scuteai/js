---
"@scute/js-core": minor
"@scute/nextjs-handlers": minor
"@scute/react-hooks": minor
"@scute/auth-ui-react": minor
---

Reliability and security fixes across the SDK.

js-core
- DELETE calls (signOut, revokeSession, removing MFA methods, devices, phones, admin deletes) now wait for the server and return its errors. `signOut()` still signs out locally first, and returns `false` if the server revocation failed.
- Concurrent `getUser()` calls with different tokens each get their own user.
- The default in-memory storage is per client (it was shared by every client in the process).
- A transient 5xx or network error no longer signs the user out; only 401/403 ends the session. Refresh requests are no longer retried on 502/503/504.
- `passkeys_enabled` must be `true` to offer passkeys (a missing field means off).
- Server-supplied SSO URLs (`SsoRequiredError.ssoLoginUrl`, `discoverSSO().saml_login_url`) are only returned when they are http(s).
- Error reports strip `sct_magic`/`sct_oauth`/`sct_sk` from the reported URL; OAuth provider names and path ids are URL-encoded; `WebAuthnError` keeps its message; blocked `localStorage` falls back to memory.

nextjs-handlers
- `/auth/sign-in` only accepts an access token issued within the last 30 seconds, and always exchanges the presented token (existing session cookies for the app are cleared first). Call sign-in right after verification, not later.
- Middleware no longer puts cookie values in a `cookie` response header; refreshed cookies reach server components through Next's request override headers.
- `export default ScuteHandler` now works on the Pages Node runtime, and the Pages Edge runtime now sets session cookies.
- CSRF: constant-time comparison, `nosniff`/`no-store` on the token endpoint, `fetchWithCsrf` refuses to send without a token. All server-side Scute API requests are `no-store`.

react-hooks
- `useAuth()` only changes on events that carry session state, and `isAuthenticated` requires a user.
- `useMfaVerify` picks up challenges raised after mount and reports switch/resend/cancel failures; MFA secrets and backup codes are cleared on sign-out.

auth-ui-react
- Sign-out or session expiry returns the flow to login and closes `ScuteAuthGate`.
- The verified token is exchanged for a session before the passkey offer, so Skip and Register work however long the user waits; required MFA enrollment can't be skipped.
- Magic-link polling stops after 10 minutes and never overlaps; double submits send one request; `onAuthenticated` runs once per sign-in from an effect.
