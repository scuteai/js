---
"@scute/auth-ui-react": patch
---

ScuteSignIn: during an MFA grace period the nudge offers "Set one up now" (the allowed methods: authenticator app, text message, email) next to "Not now", instead of only pointing to account settings. Setting up an authenticator app inside the sign-in shows a QR code of the otpauth link (new dependency `uqr`), with the link and key kept for phones and typing.
