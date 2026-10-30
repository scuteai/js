---
"@scute/js-core": minor
"@scute/auth-ui-react": minor
"@scute/nextjs-handlers": patch
---

Sign-in and MFA owner decisions (D2, D11, D13, D14, D15, D16, D17, D18, D20):

- A sign-in that needs a second factor set up first (`mfaEnrollmentRequired` with a `setupToken`) can set one up without a session: `enrollMfaWithSetupToken(setupToken, method, secretData?)` and `verifyMfaEnrollmentWithSetupToken(setupToken, enrollmentId, code)` (header `X-Scute-Setup-Token`, `SCUTE_SETUP_TOKEN_HEADER`). Verifying the factor finishes the sign-in. `MFA_ENROLLMENT_REQUIRED` is unchanged; the setup token is on its return value and on `pendingMfaChallenge`.
- An email or phone to confirm first: every sign-in path answers `{ contactVerificationRequired, field, challenge, setupToken }` with the new `contact_verification_required` event (`pendingContactVerification`). `addSignInContact`, `verifyContactVerification` and `resendContactVerification` finish it; the answer is a session or the next step, through the same handler (also after `verifyMfaChallenge`).
- `signInWithMagicLinkStatus` takes the waiting device's own steps (MFA, a factor to set up, a contact to confirm).
- A step-up or custom challenge link that signs nobody in: `verifyMagicLinkToken` answers `{ challengeCompleted: true, signedIn: false, intent, intentFields }`.
- A refresh refused with 403 `ip_blocked` or `country_blocked` keeps the session. A 401 `session_idle` ends it as before, and `sessionEndReason` says "session_idle". The Next.js refresh handler keeps the cookies on those 403s, and the App Router handler sends `request.ip` as the person's address where Next.js provides it.
- ScuteSignIn: sets up an authenticator app, text or email code when the sign-in needs one (instead of "contact support"), asks to confirm an email or phone, says "Finish on the other device" while the link's device finishes, shows "Verified" for a challenge link, explains `sign_in_method_disabled` and an idle sign-out, and says "link" or "code" as the app sends.
