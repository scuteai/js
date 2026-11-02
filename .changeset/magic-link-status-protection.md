---
"@scute/js-core": minor
"@scute/auth-ui-react": minor
---

Attack protection on the device that asked for a magic link (R2): its status can answer 202 with a code to verify, or 403 `security_block`.

- `signInWithMagicLinkStatus(payload, magicLinkId?)` and `signInWithMagicLinkId` answer the 202 as `{ verificationRequired: true, verification, reason, threats }` with the `verification_required` event, instead of `MagicLinkWindowClosedError`. `verifySignInVerification(code)` then verifies the code and asks the link's status again: signed in, this device's own step (MFA, a factor to set up, a contact to confirm), or the closed window. It also takes `{ challengeToken, magicLinkId }`. New type: `ScuteSignInVerificationRequired`.
- useScuteAuthFlow stops polling on the 202 and shows `verification_required`; the code signs in through the link's status (or moves to this device's MFA step, or back to waiting while the other device finishes). A 403 `security_block`, `ip_blocked`, `country_blocked`, `user_banned` or `user_suspended` while waiting stops polling and shows `error` with `errorCode`. `SignInRefusalCode` includes `security_block`.
