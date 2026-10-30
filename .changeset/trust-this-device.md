---
"@scute/js-core": minor
"@scute/auth-ui-react": minor
---

"Trust this device". `ScuteSignIn` shows a "Trust this device for N days" checkbox on the MFA step when the app lets people trust devices (the app config's `device_trust_enabled` and `device_trust_days`). It is off until ticked and sent with the code. `useScuteAuthFlow` exposes `deviceTrustOffered`, `deviceTrustDays`, `trustDevice` and `setTrustDevice`, and the `preview` prop takes `deviceTrustDays`.

In `@scute/js-core`: `verifyMfaChallenge(token, code, { trustDevice })` asks to trust the device on the MFA step and answers `deviceTrusted`; without the option it sends and answers what it did before. New `listTrustedDevices()`, `trustThisDevice()` and `untrustDevice(id)` for the signed-in person's devices.
