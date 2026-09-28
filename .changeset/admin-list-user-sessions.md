---
"@scute/js-core": patch
---

`admin.listUserSessions(userId)` called a route that doesn't exist (`/v1/apps/:app_id/users/:id/sessions`) and always failed with a 404. It now calls `/v1/:app_id/users/:id/sessions`, the same route family `revokeUserSession` uses.
