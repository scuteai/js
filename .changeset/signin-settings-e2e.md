---
"@scute/auth-ui-react": patch
"@scute/js-core": patch
---

Fixes from the browser tests of every sign-in and MFA setting against the API:

- `ScuteSignIn`: after a wrong code under React StrictMode (development, and Next.js by default), the code boxes stayed on "Checking" for good. They now empty and say the code didn't work.
- The grace period nudge ("Set up two-step verification", `mfa_enroll_suggest`) is shown: the sign-in that brings it no longer skips straight to signed in, and skipping the passkey offer shows it too. `pendingMfaEnrollmentSuggestion` now belongs to the sign-in that brought it.
- Backup codes are sent as shown (`XXXX-XXXX`), so the 8 boxes work with every API version.
- Refusals show the API's reason (sign-up closed, rate limits, a missing app config) instead of nothing: the HTTP status text the message came from is empty over HTTP/2.
- The waiting page of a sign-in link asks for MFA when the API says the account needs it, and stops with a message when the link was opened too long ago for it, instead of waiting for good. New `signInWithMagicLinkStatus` in `@scute/js-core` (and `signInWithMagicLinkId` now answers `data`), new `MagicLinkWindowClosedError`.
- `ScuteSignIn` asks for what the app takes (`allowed_identifiers`): an email, a phone number, or either. `useScuteAuthFlow` exposes it as `identifierTypes`.
