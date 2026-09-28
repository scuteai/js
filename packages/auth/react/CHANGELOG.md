# @scute/react

## 0.9.0-next.0

### Minor Changes

- 6976ce6: Authorization for your app's users.

  - `scute.authz.can(action, resource?, context?)`, `canMany(checks)` and `permissions(resource?)`: the signed-in user asks about their own permissions (the app must allow client checks). A permission that needs a fresh verification answers `allow_with_step_up`.
  - Server helpers on `ScuteAdminApi` (secret key): `authzCheck` (pass `challenge` to satisfy a step-up), `authzCheckBatch`, `authzUserPermissions`, `authzAuthorizedUsers`, `authzFilter` and `authzStartStepUp` (starts a verification bound to the permission).
  - Data filters for lists: `toPrismaWhere(filter)` and `toSqlWhere(filter, { columns })` turn the API's filter into a query that selects exactly the rows the user may see; `matchesFilter` and `evaluateCondition` evaluate in memory. Missing values follow SQL's three-valued logic.
  - Access requests: users call `scute.authz.requestAccess`, `myRequests`, `cancelRequest`, and reviewers `reviews`, `approveRequest`, `denyRequest`; the backend has `authzRequests`, `authzCreateRequest`, `authzDecideRequest`, and passes `approval` on `authzCheck` for permissions that need one.
  - React: `useCan(action, resource?)` (`allowed`, `needsStepUp`, `needsApproval`, `decision`) and `usePermissions()` (`has(permission)`).
  - `allowed` is true only for a plain `allow`: a step-up or approval answer is not allowed yet.
  - Embeddable admin screens: `ScuteElementsApi` (browser, with a short-lived element token your backend mints, never the app secret) and headless hooks in `@scute/auth-ui-react`: `useElementUserRoles`, `useElementAccessRequests` (`kind: "operation"` for approvals) and `useElementDecisionLog`. The token decides which users are visible and which roles may be granted.
  - Local decisions: `ScuteLocalAuthz` (server side) decides from the app's signed policy snapshot, caching users' roles and refreshing in the background, and asks the API for what a snapshot can't answer (roles on one object, attributes you didn't pass). `decideLocally`, `verifySnapshotToken` (WebCrypto, against the app's JWKS) and `decodeSnapshotToken` are exported for edge functions. Conformance vectors from the API's engine run in the test suite.

- dfef078: Sign in as a user (support access). Needs the app setting `impersonation` on.

  - Server: `scute.admin.impersonateUser(userId, { reason, minutes, actorUserId | actor })` returns an access token as the user (never a refresh token). Also `listImpersonations(userId)` and `stopImpersonating(userId, sessionId?)`.
  - Browser (or a Next.js route handler client): `scute.beginImpersonation(tokens)` switches to the session as the user and keeps the current session aside; `scute.stopImpersonating()` ends it and brings the kept session back. `scute.getImpersonation()` returns who is really acting and until when.
  - React: `useImpersonation()` returns `{ impersonating, actor, expiresAt, stop, stopping }` for a banner.
  - Server-side checks: pass `context: impersonationContext(verifiedClaims)` so permissions marked "not while impersonating" are refused. `decodeImpersonation(token)` reads the `act` claim for display.
  - Local decisions (`decideLocally`, `ScuteLocalAuthz`) refuse a permission marked `blocked_while_impersonating` when `context.impersonated` is set, matching the API (conformance vectors synced).

- d0c74ab: MFA changes that need the user to verify again. The API now authenticates the MFA self-service endpoints (they used to answer 401 to every session) and asks for a fresh check before risky changes: removing a method, new backup codes, or adding another method when one is set up. These work within the app's `mfa_reverify_minutes` (default 10) of signing in; otherwise pass a completed step-up or MFA challenge's token.

  - `removeMfaMethod(id, { challenge })`, `generateBackupCodes({ challenge })`, `enrollMfa({ ..., challenge })`
  - `needsReverification(error)` tells you to ask the user to sign in again (or verify)
  - React: `useFactorList().remove(id, { challenge })`, `useBackupCodes().generate({ challenge })`

- ffc5e79: Reliability and security fixes across the SDK.

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

### Patch Changes

- c47ba9d: Authorization fixes from a bug sweep:

  - Local decisions: an `exists` on an attribute you didn't pass (the user's, or a known object's) asks the server instead of answering locally, unless `strict`. Lookups read own keys of plain objects only (no array `length`, nothing from the prototype), equality is structural for lists and objects, and resource types are lowercased like the engine does. Null is missing on both sides; new conformance vectors cover it.
  - `toSqlWhere`: an empty list compiles to `(col IS NULL AND NULL)` for a column, so a NOT around it can't select rows with no value.
  - `useCan` / `usePermissions` never report the previous inputs' answer while a new check is in flight.
  - `useElementDecisionLog.loadMore` loads each page once and drops pages answered for older filters.

- Updated dependencies [8d3a4ea]
- Updated dependencies [6976ce6]
- Updated dependencies [c47ba9d]
- Updated dependencies [dfef078]
- Updated dependencies [d0c74ab]
- Updated dependencies [b991723]
- Updated dependencies [ffc5e79]
- Updated dependencies [1d92e56]
  - @scute/js-core@0.10.0-next.0

## 0.8.1

### Patch Changes

- Updated dependencies
  - @scute/js-core@0.9.0

## 0.8.0

### Minor Changes

- Clear the session on a rejected refresh so a dead refresh token (stale post-0.7 migration cookie, revoked or cleaned-up session, or flushed token store) drops the user to a clean login instead of looping refresh/401 forever.

### Patch Changes

- Updated dependencies
  - @scute/js-core@0.8.0

## 0.7.0

### Minor Changes

- MFA management methods, per-app CSRF cookie namespacing, per-app instance tracking and session management improvements, alternate phone management functions and hooks

### Patch Changes

- Updated dependencies
  - @scute/js-core@0.7.0

## 0.6.1

### Patch Changes

- Add MFA enrollment suggestion flow and verifications API.

  - `@scute/js-core`: new `ScuteVerifyApi` exposed as `client.verifications`, with exported types `Verification`, `VerificationStatus`, `VerificationMethod`, `VerificationListParams`, `VerificationRisk`, `VerificationResult`. Adds sandbox detection and environment handling in `ScuteBaseHttp`. Emits `MFA_ENROLLMENT_SUGGESTED` when the server signals grace-period enrollment in a token payload.
  - `@scute/nextjs-handlers`: `createClientComponentClient` patches `signInWithTokenPayload` to surface `mfa_enrollment_suggested` from the server response so the suggestion event fires before `SIGNED_IN`.
  - `@scute/auth-ui-react`: `useScuteAuthFlow` routes users into `mfa_enroll_suggest` view after passkey registration when the client has a pending MFA enrollment suggestion, and fixes `skipPasskey` to not double-dispatch `authenticated`.

- Updated dependencies
  - @scute/js-core@0.6.1

## 0.6.0

### Minor Changes

- Intent verification support, verification modes, and tenant app verify-only mode.

### Patch Changes

- Updated dependencies
  - @scute/js-core@0.6.0

## 0.5.1

### Patch Changes

- Add MFA support and challenge-based authentication flow
- Updated dependencies
  - @scute/js-core@0.4.1

## 0.4.0

### Minor Changes

- minor changes

### Patch Changes

- Updated dependencies
  - @scute/js-core@0.4.0

## 0.3.0

### Minor Changes

- fingerprinting & maintenance

### Patch Changes

- Updated dependencies
  - @scute/js-core@0.3.0

## 0.2.5

### Patch Changes

- fixes the oauth token handling
- Updated dependencies
  - @scute/js-core@0.2.5

## 0.2.4

### Patch Changes

- adds support for react native
- Updated dependencies
  - @scute/js-core@0.2.4

## 0.2.3

### Patch Changes

- Strip down ui and keep the core logic with react hooks and next handlers
- Updated dependencies
  - @scute/js-core@0.2.3

## 0.2.2

### Patch Changes

- fixes the register form check
- Updated dependencies
  - @scute/js-core@0.2.2

## 0.2.1

### Patch Changes

- hotfix: register form
- Updated dependencies
  - @scute/js-core@0.2.1

## 0.2.0

### Minor Changes

- adds phone otp

### Patch Changes

- Updated dependencies
  - @scute/js-core@0.2.0

## 0.1.2

### Patch Changes

- Adds UserButton component
- Updated dependencies
  - @scute/js-core@0.1.2

## 0.1.1

### Patch Changes

- Fixes a minor issue where back to login pops up during oauth flow
- Updated dependencies
  - @scute/js-core@0.1.1

## 0.1.0

### Minor Changes

- oAuth provider login

### Patch Changes

- Updated dependencies
  - @scute/js-core@0.1.0

## 0.0.11

### Patch Changes

- Fine tuning the design, fonts and spacings
- Updated dependencies
  - @scute/js-core@0.0.11

## 0.0.10

### Patch Changes

- Mobile UI for new designs
- Updated dependencies
  - @scute/js-core@0.0.10

## 0.0.9

### Patch Changes

- Hotfxes for themeing
- Updated dependencies
  - @scute/js-core@0.0.9

## 0.0.8

### Patch Changes

- Profile styling and theme fixes
- Updated dependencies
  - @scute/js-core@0.0.8

## 0.0.7

### Patch Changes

- New design themes
- Updated dependencies
  - @scute/js-core@0.0.7

## 0.0.6

### Patch Changes

- New design
- Updated dependencies
  - @scute/js-core@0.0.6

## 0.0.5

### Patch Changes

- Fixes translations for profile and cross login issues
- Updated dependencies
  - @scute/js-core@0.0.5

## 0.0.4

### Patch Changes

- Fix errors and update tsup for better TS compatibility
- Updated dependencies
  - @scute/js-core@0.0.4

## 0.0.3

### Patch Changes

- Added language translations and an error reporting service
- Updated dependencies
  - @scute/js-core@0.0.3

## 0.0.2

### Patch Changes

- General improvements and bugfixes
- Updated dependencies
  - @scute/js-core@0.0.2

## 0.0.0

### Major Changes

- initial packages major bump

### Patch Changes

- Updated dependencies
  - @scute/js-core@0.0.0
