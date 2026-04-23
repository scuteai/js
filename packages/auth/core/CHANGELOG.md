# @scute/js-core

## 0.6.1

### Patch Changes

- Add MFA enrollment suggestion flow and verifications API.

  - `@scute/js-core`: new `ScuteVerifyApi` exposed as `client.verifications`, with exported types `Verification`, `VerificationStatus`, `VerificationMethod`, `VerificationListParams`, `VerificationRisk`, `VerificationResult`. Adds sandbox detection and environment handling in `ScuteBaseHttp`. Emits `MFA_ENROLLMENT_SUGGESTED` when the server signals grace-period enrollment in a token payload.
  - `@scute/nextjs-handlers`: `createClientComponentClient` patches `signInWithTokenPayload` to surface `mfa_enrollment_suggested` from the server response so the suggestion event fires before `SIGNED_IN`.
  - `@scute/auth-ui-react`: `useScuteAuthFlow` routes users into `mfa_enroll_suggest` view after passkey registration when the client has a pending MFA enrollment suggestion, and fixes `skipPasskey` to not double-dispatch `authenticated`.

## 0.6.0

### Minor Changes

- Intent verification support, verification modes, and tenant app verify-only mode.

## 0.5.1

### Patch Changes

- Add MFA support and challenge-based authentication flow

## 0.4.0

### Minor Changes

- minor changes

## 0.3.0

### Minor Changes

- fingerprinting & maintenance

## 0.2.5

### Patch Changes

- fixes the oauth token handling

## 0.2.4

### Patch Changes

- adds support for react native

## 0.2.3

### Patch Changes

- Strip down ui and keep the core logic with react hooks and next handlers

## 0.2.2

### Patch Changes

- fixes the register form check

## 0.2.1

### Patch Changes

- hotfix: register form

## 0.2.0

### Minor Changes

- adds phone otp

## 0.1.2

### Patch Changes

- Adds UserButton component

## 0.1.1

### Patch Changes

- Fixes a minor issue where back to login pops up during oauth flow

## 0.1.0

### Minor Changes

- oAuth provider login

## 0.0.11

### Patch Changes

- Fine tuning the design, fonts and spacings

## 0.0.10

### Patch Changes

- Mobile UI for new designs

## 0.0.9

### Patch Changes

- Hotfxes for themeing

## 0.0.8

### Patch Changes

- Profile styling and theme fixes

## 0.0.7

### Patch Changes

- New design themes

## 0.0.6

### Patch Changes

- New design

## 0.0.5

### Patch Changes

- Fixes translations for profile and cross login issues

## 0.0.4

### Patch Changes

- Fix errors and update tsup for better TS compatibility

## 0.0.3

### Patch Changes

- Added language translations and an error reporting service

## 0.0.2

### Patch Changes

- General improvements and bugfixes

## 0.0.0

### Major Changes

- initial packages major bump
