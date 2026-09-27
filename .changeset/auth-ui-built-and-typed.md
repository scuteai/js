---
"@scute/auth-ui-react": minor
---

`@scute/auth-ui-react` now ships a built, typed package (`dist/`, CJS + ESM + `.d.ts`) instead of raw, unchecked TypeScript source. `// @ts-nocheck` is gone and the package typechecks against the SDK it wraps. `submitMfaCode` no longer tries a second sign-in after `verifyMfaChallenge` (which already signs in).
