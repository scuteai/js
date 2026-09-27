---
"@scute/js-core": minor
"@scute/react-hooks": minor
"@scute/auth-ui-react": minor
---

Authorization for your app's users.

- `scute.authz.can(action, resource?, context?)`, `canMany(checks)` and `permissions(resource?)`: the signed-in user asks about their own permissions (the app must allow client checks). A permission that needs a fresh verification answers `allow_with_step_up`.
- Server helpers on `ScuteAdminApi` (secret key): `authzCheck` (pass `challenge` to satisfy a step-up), `authzCheckBatch`, `authzUserPermissions`, `authzAuthorizedUsers`, `authzFilter` and `authzStartStepUp` (starts a verification bound to the permission).
- Data filters for lists: `toPrismaWhere(filter)` and `toSqlWhere(filter, { columns })` turn the API's filter into a query that selects exactly the rows the user may see; `matchesFilter` and `evaluateCondition` evaluate in memory. Missing values follow SQL's three-valued logic.
- Access requests: users call `scute.authz.requestAccess`, `myRequests`, `cancelRequest`, and reviewers `reviews`, `approveRequest`, `denyRequest`; the backend has `authzRequests`, `authzCreateRequest`, `authzDecideRequest`, and passes `approval` on `authzCheck` for permissions that need one.
- React: `useCan(action, resource?)` (`allowed`, `needsStepUp`, `needsApproval`, `decision`) and `usePermissions()` (`has(permission)`).
- `allowed` is true only for a plain `allow`: a step-up or approval answer is not allowed yet.
- Embeddable admin screens: `ScuteElementsApi` (browser, with a short-lived element token your backend mints, never the app secret) and headless hooks in `@scute/auth-ui-react`: `useElementUserRoles`, `useElementAccessRequests` (`kind: "operation"` for approvals) and `useElementDecisionLog`. The token decides which users are visible and which roles may be granted.
- Local decisions: `ScuteLocalAuthz` (server side) decides from the app's signed policy snapshot, caching users' roles and refreshing in the background, and asks the API for what a snapshot can't answer (roles on one object, attributes you didn't pass). `decideLocally`, `verifySnapshotToken` (WebCrypto, against the app's JWKS) and `decodeSnapshotToken` are exported for edge functions. Conformance vectors from the API's engine run in the test suite.
