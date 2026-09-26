---
"@scute/js-core": minor
---

Add `SsoRequiredError` (and `isSsoRequiredError`). When a workspace enforces SAML SSO for the user's email domain, sign-in now rejects with this typed error instead of a generic HTTP error; it carries `ssoLoginUrl` and `domain` so you can redirect straight to SSO. It still extends `BaseHttpError`, so existing handling keeps working. `getSamlLoginUrl`'s `relayState` argument is documented as ignored by the API (the user always lands on the app's configured login URL).
