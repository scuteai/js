---
"@scute/nextjs-handlers": patch
---

The internal handler's 401 for a rejected refresh no longer declares `Content-Type: application/json` with an empty body.
