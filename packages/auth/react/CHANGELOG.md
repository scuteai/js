# @scute/react

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
