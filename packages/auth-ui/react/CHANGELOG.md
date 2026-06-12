# @scute/auth-ui-react

## 0.3.0

### Minor Changes

- Clear the session on a rejected refresh so a dead refresh token (stale post-0.7 migration cookie, revoked or cleaned-up session, or flushed token store) drops the user to a clean login instead of looping refresh/401 forever.

### Patch Changes

- Updated dependencies
  - @scute/js-core@0.8.0
  - @scute/react-hooks@0.8.0

## 0.2.0

### Minor Changes

- MFA management methods, per-app CSRF cookie namespacing, per-app instance tracking and session management improvements, alternate phone management functions and hooks

### Patch Changes

- Updated dependencies
  - @scute/js-core@0.7.0
  - @scute/react-hooks@0.7.0

## 0.1.3

### Patch Changes

- Add MFA enrollment suggestion flow and verifications API.

  - `@scute/js-core`: new `ScuteVerifyApi` exposed as `client.verifications`, with exported types `Verification`, `VerificationStatus`, `VerificationMethod`, `VerificationListParams`, `VerificationRisk`, `VerificationResult`. Adds sandbox detection and environment handling in `ScuteBaseHttp`. Emits `MFA_ENROLLMENT_SUGGESTED` when the server signals grace-period enrollment in a token payload.
  - `@scute/nextjs-handlers`: `createClientComponentClient` patches `signInWithTokenPayload` to surface `mfa_enrollment_suggested` from the server response so the suggestion event fires before `SIGNED_IN`.
  - `@scute/auth-ui-react`: `useScuteAuthFlow` routes users into `mfa_enroll_suggest` view after passkey registration when the client has a pending MFA enrollment suggestion, and fixes `skipPasskey` to not double-dispatch `authenticated`.

- Updated dependencies
  - @scute/js-core@0.6.1
  - @scute/react-hooks@0.6.1

## 0.1.1

### Patch Changes

- Updated dependencies
  - @scute/js-core@0.6.0
  - @scute/react-hooks@0.6.0
