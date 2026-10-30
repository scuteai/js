---
"@scute/js-core": minor
"@scute/react-hooks": minor
---

"Sign in as this user" hands the session to your app through a one-time link instead of a token. The link opens your sign-in page with `?sct_imp=<code>`, a short-lived code that works once. `AuthContextProvider` takes it on its own: it removes the code from the address bar, swaps it for the session as the user and switches to it like `beginImpersonation`, so `useImpersonation` shows your banner. Turn this off with `acceptImpersonationHandoff={false}`.

In `@scute/js-core`: `signInWithImpersonationHandoff(code?)`, `getImpersonationHandoffCode(url?)`, `admin.createImpersonationHandoff(userId, params)` (answers the link instead of the token), the `SCUTE_IMPERSONATION_HANDOFF_PARAM` constant, and `scrubAuthTokensFromUrl` also removes `sct_imp`.
