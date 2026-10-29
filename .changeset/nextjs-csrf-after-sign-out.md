---
"@scute/nextjs-handlers": patch
---

Signing in again after signing out works in the same browser. A route handler that also writes cookies through `cookies()` has its response cookies rewritten by Next.js, which dropped `Max-Age=0` from the CSRF cookie's deletion and left an empty CSRF cookie behind. `/auth/csrf` then answered with an empty token, so the next sign-in (and refresh) through the handlers failed: after a second step (MFA) the sign-in reported a wrong code. The deletion now also sets a past `Expires`, and `/auth/csrf` mints a new token when the cookie is empty.
