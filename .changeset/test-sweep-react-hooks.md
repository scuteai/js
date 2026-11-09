---
"@scute/react-hooks": minor
---

- `useMfaVerify` does not report `verified` when the code leads to a further sign-in step; the step is exposed as `nextStep`.
- `useFactorList` makes no request while signed out (empty list, no error) and reloads when the signed-in user changes.
- `AuthContextProvider` uses js-core's `SESSION_EVENTS`.
