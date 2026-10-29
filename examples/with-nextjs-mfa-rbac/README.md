# Scute with Next.js: sign-in, MFA and a protected page

A small Next.js (App Router) app that adds Scute from scratch:

- **Sign-in** with the drop-in `ScuteSignIn` component (`@scute/auth-ui-react`): email, then a code, a sign-in link or a passkey, as your app is set up.
- **Two-step verification (MFA)**: the app requires a second step; people set one up on their account page (authenticator app, email code, text message code, backup codes, and a passkey) and sign in with it.
- **The grace-period nudge**: a person without a second step yet is let in with a reminder, until the days you allow run out.
- **A custom second step** (headless): the same sign-in with the MFA step drawn by the app, for when you build your own UI.
- **Protected server pages** (`/account`, `/projects`) that read the session on the server, and **sign-out**.
- **A spot for roles and permissions**: `/projects` has view, edit and delete actions marked `TODO(RBAC)`.

The step-by-step tutorial for this app is in the Scute docs: [MFA and RBAC with Next.js](https://docs.scute.io/guides/mfa-rbac-tutorial).

## What you need

- Node.js 20 or later.
- A Scute account and an app in the [dashboard](https://control.scute.io).
- These packages, at least:

  | Package | Version |
  | --- | --- |
  | `@scute/auth-ui-react` | `0.4.0-next.5` |
  | `@scute/react-hooks` | `0.9.0-next.5` |
  | `@scute/nextjs-handlers` | `0.9.0-next.5` |

  They are prereleases, published under the `next` tag. Inside this repository the example uses the local packages (`workspace:*`). In your own app, install them with `npm install @scute/auth-ui-react@next @scute/react-hooks@next @scute/nextjs-handlers@next`.

## Set up the Scute app

In the dashboard, open your app and set:

1. **Domains > Allowed domains**: add `http://localhost:3000` (the address you run the app on).
2. **Authentication > Ways to sign in**: Email on. Turn **Passkeys** on to try passkeys.
3. **Authentication > Second step (MFA)**:
   - **Who's asked**: `Required` (everyone) or `Optional` (only people who set one up).
   - **What they can use**: the methods people may set up (authenticator app, email code, SMS code, backup codes).
   - **Time to set it up** (Required only): the grace period in days. New people can sign in without a second step until it ends, with a reminder each time. `0` means no grace period.
   - **A passkey counts as both** (with passkeys on): signing in with a passkey skips the second step.
4. **API keys > New key**: copy the secret once; it is your `SCUTE_SECRET`.

Your app's ID is on its **Overview**.

## Run it

From the root of this repository:

```bash
npx pnpm@8.4.0 install
npx pnpm@8.4.0 turbo run build --filter=with-nextjs-mfa-rbac^...
cp examples/with-nextjs-mfa-rbac/env.example examples/with-nextjs-mfa-rbac/.env.local
# fill in .env.local, then:
npx pnpm@8.4.0 --filter with-nextjs-mfa-rbac dev
```

The second command builds the Scute packages the example uses. Open http://localhost:3000.

### Environment variables

| Variable | |
| --- | --- |
| `NEXT_PUBLIC_SCUTE_APP_ID` | Your app's ID (`app_...`). |
| `NEXT_PUBLIC_SCUTE_BASE_URL` | `https://api.scute.io`. |
| `SCUTE_SECRET` | Your app's secret API key. Server only: never prefix it with `NEXT_PUBLIC_`. |

## Try it

1. Open **/account**. You are not signed in, so the server sends you to `/sign-in?next=/account`.
2. Sign in with your email and the code. With passkeys on you are offered one; skip it for now.
3. With MFA required and no second step yet, the sign-in shows **Set up two-step verification** with the days left. Continue.
4. On **/account**, set up the **Authenticator app**: scan the QR code with Google Authenticator, 1Password, Authy or similar, and enter the code. Add an **email code** or a **text message code** if your app allows them, and **make backup codes** (save them: you see them once).
5. Sign out, and sign in again: after the email code the sign-in asks for the code from your authenticator app. **Or use another way** switches to an email code, a text message code or a backup code.
6. Open **Custom second step** in the header and sign in again: the MFA step is now drawn by `src/app/sign-in/custom/page.tsx`.
7. On **/account**, **Add a passkey**. Next time, sign in with the passkey: with "A passkey counts as both" on, no second step is asked.

## Where things are

| File | What it does |
| --- | --- |
| `src/app/providers.tsx` | Creates the browser Scute client (`createClientComponentClient`) and shares it with `AuthContextProvider`. |
| `src/app/auth/[...scute]/route.ts` | The Scute route handlers: keep the refresh token in an httpOnly cookie, refresh, sign out. |
| `src/app/sign-in/sign-in.tsx` | The drop-in `ScuteSignIn`. Handles the second step, the grace-period nudge and the passkey offer by itself. |
| `src/app/sign-in/custom/page.tsx` | The headless way for one step: `ScuteAuthGate` with `renderView` draws the MFA step; the rest stays drop-in. |
| `src/lib/session.ts` | Reads the session on the server (`createServerComponentClient`); `requireUser()` redirects signed-out visitors. |
| `src/app/account/page.tsx` | A protected server page. |
| `src/app/account/security-settings.tsx` | Setting up a second step with the `useSecureAccount()` hook: TOTP with a QR code, email, SMS, backup codes, passkey. |
| `src/app/projects/page.tsx` | A protected page with view, edit and delete actions, waiting for roles and permissions (`TODO(RBAC)`). |
| `src/components/sign-out-button.tsx` | Sign-out. |

## What the sign-in can answer

`ScuteSignIn` explains each of these on its own step. With the headless hooks, `useScuteAuthFlow()` gives the view and the API's `errorCode`.

| You see | Why | What to do |
| --- | --- | --- |
| "Set up two-step verification first" | MFA is required, this person has no second step, and the grace period is over (or is `0`). No session is made. | Raise **Time to set it up**, or set the second step up for them before they sign in. A person can set one up only while signed in. |
| "Set up two-step verification" with days left | Inside the grace period. They are signed in. | Set one up on the account page. |
| "That code didn't work" on the second step | Wrong or expired code, or a backup code already used. | Use the newest code; authenticator codes change every 30 seconds. |
| "Verify it's you first: sign in again, ..." when adding a method, removing one or making backup codes | These need a recent sign-in (**Ask users to verify again after**, 10 minutes by default). The API answers `verification_required`; `needsReverification(error)` from `@scute/js-core` checks for it. | Sign out, sign in again, retry. |
| "MFA method not allowed for this app" | The method is off under **What they can use** (`method_not_allowed`). | Turn it on in the dashboard. |
| "This account can't sign in", "This account is suspended", "Sign-ins from your network (or country) are blocked" | The account or the network is refused (`user_banned`, `user_suspended`, `ip_blocked`, `country_blocked`). | Check the user and your workspace's rules in the dashboard. |
| "Sign-in isn't available right now" (after a few seconds of loading) | The app's settings didn't load (`app_settings_unavailable`): this address isn't an allowed domain (the browser blocks the request), the app ID is wrong, or the API can't be reached. | Add the address under **Domains > Allowed domains**, check `.env.local`. |

## Trust this device

Not shown here, and not in the SDK yet. The Scute API can trust a device after a sign-in that passed a second step (with **Security > Attack protection > Let people trust a device** on): a trusted device skips attack protection's new-device check for the days you set. It does not skip the second step itself. The SDK and `ScuteSignIn` don't offer it yet; whether and how they should is an open decision.

## Notes

- Server components never refresh tokens (they can't set cookies). When the access token has expired, the server sees no session and sends the visitor to `/sign-in`, where the browser client refreshes it and continues.
- Passkeys need a secure page: https, or `localhost` while developing.
- The account page reads `user.webauthn_enabled` to show whether a passkey is set up, since `useSecureAccount()` can't always tell.
