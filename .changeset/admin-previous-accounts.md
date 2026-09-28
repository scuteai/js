---
"@scute/js-core": minor
---

- `admin.previousAccounts(userId)` lists a person's earlier, deleted accounts: someone deleted who signs in again now gets a fresh account.
- `admin.mergeUser(userId, fromId)` merges a deleted account into the live one. Roles, passkeys, MFA factors and data move over; history stays on the old account.
- `admin.getUserByUserId` reads the user with the secret key (it called a route that only takes an identifier and always failed). It's deprecated in favour of `admin.getUser`.
- `ScuteSessionType` lists every session type the API returns (otp, workspace, m2m, mfa, challenge, impersonation).
