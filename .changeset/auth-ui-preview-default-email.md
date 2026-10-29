---
"@scute/auth-ui-react": minor
---

`ScuteSignIn` takes `defaultEmail` (also on `ScuteAuthGate`): the email the field starts with, until the visitor edits it. New `preview` prop: draws one step with sample data (`"login"`, or `{ view, email, error, errorCode, mfaMethod, mfaMethods, ... }`) with no Scute client, no requests and no focus taken, for settings previews, docs and screenshots. New `"fill"` layout: the full-page look sized to its container instead of the window. When the app's settings don't load, the sign-in shows an error step with "Try again" instead of the email field (`useScuteAuthFlow` sets `errorCode` to `"app_settings_unavailable"`, exported as `APP_SETTINGS_UNAVAILABLE`, and `retry` loads them again).
