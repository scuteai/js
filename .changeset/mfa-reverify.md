---
"@scute/js-core": minor
"@scute/react-hooks": minor
---

MFA changes that need the user to verify again. The API now authenticates the MFA self-service endpoints (they used to answer 401 to every session) and asks for a fresh check before risky changes: removing a method, new backup codes, or adding another method when one is set up. These work within the app's `mfa_reverify_minutes` (default 10) of signing in; otherwise pass a completed step-up or MFA challenge's token.

- `removeMfaMethod(id, { challenge })`, `generateBackupCodes({ challenge })`, `enrollMfa({ ..., challenge })`
- `needsReverification(error)` tells you to ask the user to sign in again (or verify)
- React: `useFactorList().remove(id, { challenge })`, `useBackupCodes().generate({ challenge })`
