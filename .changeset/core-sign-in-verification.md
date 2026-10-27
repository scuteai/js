---
"@scute/js-core": minor
---

Attack protection's "verification required" answer to a magic link (202) no longer looks like a sign-in: `verifyMagicLinkToken` returns `{ verificationRequired: true, verification }`, emits the new `verification_required` event and signs nobody in. `verifySignInVerification(code)` verifies the code with the challenge token alone, then checks the same link again, which signs in (or asks for MFA). `pendingSignInVerification` holds the pending challenge.

Passkey registration on a page that can't use passkeys (an insecure context or a browser without WebAuthn) now fails with `PasskeysUnavailableError` (`ERROR_PASSKEYS_UNAVAILABLE`) instead of the misleading "User ID was not between 1 and 64 characters", and `identifyRegistrationError` measures a base64url user id in bytes. New helper: `passkeysAvailable()`.
