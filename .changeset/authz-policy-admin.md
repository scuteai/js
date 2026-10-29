---
"@scute/js-core": minor
"@scute/nextjs-handlers": patch
---

Set up and manage authorization from your backend with the secret key (an owner or admin key), and read what Scute decided:

- Policy: `admin.authzResources()`, `authzCreateResource`, `authzUpdateResource`, `authzDeleteResource` (a resource's actions are its permissions, like `project:edit`); `authzPermissions()`, `authzCreatePermission`, `authzUpdatePermission` (turn on a step-up with `requires_verification`, or `requires_approval`), `authzDeletePermission`; `authzRoles()`, `authzCreateRole` (a grant can carry a condition), `authzUpdateRole`, `authzDeleteRole` (`reassignTo` moves the people who hold it); `authzUserRoles`, `authzAssignRole` (optionally until `expiresAt`), `authzRevokeRole`; and `authzSettings()` / `authzUpdateSettings`.
- `admin.authzVerifyStepUp(token, code)` checks the code a user typed against a step-up challenge (the token `authzStartStepUp` returned). A wrong code is an error whose `json.remaining_attempts` says how many tries are left.
- `admin.authzDecisions({ userId, decision, permission, resource, reason, agentId, taskId, since, until, limit, before })` lists the decision log, newest first; pass `next` from the answer as `before` for the older page.
- The types are exported (`AuthzPolicyRole`, `AuthzPolicyPermission`, `AuthzPolicyResource`, `AuthzSettings`, `AuthzLoggedDecision`, ...), and `@scute/nextjs-handlers` re-exports them.
