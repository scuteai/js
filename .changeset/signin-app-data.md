---
"@scute/js-core": patch
---

- `signIn` waits for the app's settings before choosing how to sign in (like `signInOrUp`). Called right after the client was created, it used to throw a TypeError when the settings answered late.
- `signIn` and `signInOrUp` return the error when the app's settings can't load, instead of throwing or guessing the sign-in method.
- `admin.listUserSessions` and `admin.revokeUserSession` work with the app's secret key alone (the API change is on the v2 API).
