---
"@scute/auth-ui-react": minor
---

`ScuteSignIn` (and `ScuteAuthGate`) tag the way this browser last signed in "Last used": the Continue button after an email, phone, passkey or SSO sign-in, "Continue with Google" after Google. Shown only when the first step offers more than one way; `showLastUsed={false}` turns it off. Kept in localStorage, nothing is sent. `useScuteAuthFlow` returns `lastUsedMethod`; `markLastUsedMethod("sso")` notes a sign-in your page starts itself, `getLastUsedMethod()` reads it. `preview` takes `lastUsed`.
