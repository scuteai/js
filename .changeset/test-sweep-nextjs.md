---
"@scute/nextjs-handlers": minor
---

Auth handler and cookie adapter fixes.

- `/auth/refresh` with no refresh cookie only exchanges an access cookie issued in the last 30 seconds (the sign-in rule); otherwise, and with no session at all, it answers 401 (was 200 `{"access":null}`).
- A 5xx or unreachable upstream on `/auth/refresh` keeps the cookies and answers 502/503; only a rejected refresh token signs out.
- Sign-in validates the presented token before clearing the existing session.
- Unknown handler paths answer 400 without any upstream call.
- The Pages server and middleware cookie adapters read the last Set-Cookie write, so a deleted cookie is never read back; a missing middleware cookie reads as null.
