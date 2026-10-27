---
"@scute/auth-ui-react": minor
---

New `ScuteSignIn` component: the complete sign-in (email, passkey, magic link or code, MFA, passkey offer) as one themeable component with its own scoped stylesheet, so it needs no CSS import or Tailwind. Theme it with `appearance` (logo, accent color, light, dark or auto, radius, font, illustration, page or card layout), and set `copy`, `legal` links and `methods` (Google). `ScuteAuthGate` now renders it when signed out and accepts the same `copy`, `legal` and `methods`; its `appearance`, `renderView` and `onAuthenticated` keep working.

`useScuteAuthFlow` closes its gaps against the API: `resend` for the login link or code (30 second cooldown, `resendIn`), attack protection's code step on a magic link (`verification_required` view, `submitVerificationCode`), no passkey offer where the browser can't make one (`passkeysSupported`), `errorCode` for sign-in refusals (`user_banned`, `user_suspended`, `ip_blocked`, `country_blocked`), MFA `resendMfaCode` and `switchMfaMethod`, the grace period read on `mfa_enrollment_suggested`, a fallback to a link or a code when the passkey prompt is cancelled, and `signInWithOAuth`. `submitOtp`, `submitMfaCode` and `submitVerificationCode` resolve to whether the code was accepted. The bundle now starts with `"use client"`.
