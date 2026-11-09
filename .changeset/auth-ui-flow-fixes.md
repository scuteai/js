---
"@scute/auth-ui-react": patch
---

`useScuteAuthFlow`: a refused final token exchange now shows the error view instead of stalling; the authenticator secret is cleared from state after enrolling through the setup pass; the auth listener subscribes once instead of on every view change; a `SIGNED_IN` that lands before initialization finishes is no longer replaced by the login view; the code path keeps the MFA grace-period fields. `useSecureAccount`: returned `{ error }` results from `getAppData`/`listMfaMethods` are reported in `error`, and passkey enrollment reads the current user's `webauthn_enabled`. `useSessions().revoke()` on this device's own session signs out locally.
