---
"@scute/js-core": minor
"@scute/react-hooks": minor
---

Sign in as a user (support access). Needs the app setting `impersonation` on.

- Server: `scute.admin.impersonateUser(userId, { reason, minutes, actorUserId | actor })` returns an access token as the user (never a refresh token). Also `listImpersonations(userId)` and `stopImpersonating(userId, sessionId?)`.
- Browser (or a Next.js route handler client): `scute.beginImpersonation(tokens)` switches to the session as the user and keeps the current session aside; `scute.stopImpersonating()` ends it and brings the kept session back. `scute.getImpersonation()` returns who is really acting and until when.
- React: `useImpersonation()` returns `{ impersonating, actor, expiresAt, stop, stopping }` for a banner.
- Server-side checks: pass `context: impersonationContext(verifiedClaims)` so permissions marked "not while impersonating" are refused. `decodeImpersonation(token)` reads the `act` claim for display.
- Local decisions (`decideLocally`, `ScuteLocalAuthz`) refuse a permission marked `blocked_while_impersonating` when `context.impersonated` is set, matching the API (conformance vectors synced).
