---
"@scute/auth-ui-react": patch
---

`useScuteAuthFlow` (and so `ScuteSignIn`) shows the passkey offer and the MFA grace-period nudge, which both say "You're signed in", only after the token exchange has stored the session (and a Next.js handler has set its cookies). Before, they showed while the exchange was still running, so leaving the page then lost the sign-in. A refused exchange now shows the error view instead of the passkey offer.
