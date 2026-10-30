# `@scute/auth-ui-react`

Sign-in UI and headless hooks for [Scute](https://scute.io) in React.

- **`ScuteSignIn`**: the complete sign-in as one themeable component. Email first, then a passkey, a magic link or a 6-digit code (as your app is set up), MFA, and a passkey offer for next time.
- **`ScuteAuthGate`**: wraps your app and shows `ScuteSignIn` until the visitor is signed in.
- **Headless hooks** (`useScuteAuthFlow`, `useUserProfile`, `useSessions`, `useAlternatePhones`, `useSecureAccount`, `useElement*`) when you want to draw everything yourself.

The components bring their own scoped stylesheet: no CSS import, no Tailwind, no bundler setup. They render the same in any React 18 or 19 app.

## Install

```bash
npm install @scute/auth-ui-react @scute/react-hooks
```

Both components need the Scute client above them, from `AuthContextProvider` in `@scute/react-hooks`.

## ScuteSignIn

```tsx
import { ScuteSignIn } from "@scute/auth-ui-react";

<ScuteSignIn
  appearance={{ logo: "/logo.svg", accentColor: "#0f766e", theme: "auto" }}
  copy={{ title: "Sign in to Acme" }}
  legal={{ termsUrl: "/terms", privacyUrl: "/privacy" }}
  methods={{ google: true }}
  onSignedIn={(user) => console.log("signed in", user.email)}
/>;
```

### Props

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `appearance.logo` | `ReactNode \| string` | none | Your logo above the form: an element, or an image URL. |
| `appearance.accentColor` | `string` (any CSS color) | near-black (light), near-white (dark) | Primary button and focus color. The button text picks black or white for contrast. |
| `appearance.theme` | `"light" \| "dark" \| "auto"` | `"light"` | `"auto"` follows the visitor's system setting. |
| `appearance.radius` | `"none" \| "small" \| "medium" \| "large"` | `"medium"` | Corners of fields, buttons, code boxes and the card. |
| `appearance.fontFamily` | `string` | inherited from the page | A CSS `font-family` for the whole sign-in. |
| `appearance.illustration` | `ReactNode \| false` | a small neutral icon per step | Your own element above the step, or `false` for none. |
| `appearance.layout` | `"page" \| "fill" \| "card"` | `"page"` | `"page"` fills the viewport; `"fill"` is the same page sized to its container (a panel, a modal, a preview frame); `"card"` is a panel for your own page. |
| `appearance.className` | `string` | none | A class on the root element. |
| `copy.title` | `string` | `"Sign in"` | First step's title. |
| `copy.subtitle` | `string` | `"Enter your email and we will send you a link or a code. No account yet? This makes one."` | First step's lead. |
| `copy.emailLabel` | `string` | `"Email"` | The field's label. |
| `copy.emailPlaceholder` | `string` | `"name@company.com"` | The field's placeholder. |
| `copy.continueLabel` | `string` | `"Continue"` | The submit button. |
| `legal.termsUrl` | `string` | none | Links "Terms" under the form. |
| `legal.privacyUrl` | `string` | none | Links "Privacy Policy" under the form. The line shows when either is set. |
| `methods.google` | `boolean` | `false` | Adds "Continue with Google". Set Google up for your app in Scute first. |
| `defaultEmail` | `string` | none | The email the field starts with (an invited address, the last one used here). Shown until the visitor edits it; "Use a different email" starts empty. |
| `preview` | `AuthFlowView \| ScuteSignInPreview` | none | Draws one step with sample data instead of running the sign-in. See [Previews](#previews). |
| `onSignedIn` | `(user) => void` | none | Called once each time someone finishes signing in. |

All prop types are exported: `ScuteSignInProps`, `ScuteSignInAppearance`, `ScuteSignInCopy`, `ScuteSignInLegal`, `ScuteSignInMethods`, `ScuteSignInPreview`.

### What it handles

- **Email**, then whatever the app is set up for: a passkey, a magic link (with polling, so opening the link on another device signs this page in), or a 6-digit code (paste or type, sends itself when full).
- **Resend** of the link or the code, once every 30 seconds.
- **Attack protection**: when Scute wants to confirm an unusual magic link sign-in, the visitor gets a code and enters it right there; the same link then signs in.
- **MFA**: authenticator app, email or text code (with resend), backup codes (8 characters), and switching between the methods the visitor has. When the app lets people trust devices, a "Trust this device for N days" checkbox (off until ticked) goes with the code.
- **Passkey offer** after a link or a code, skipped where the browser can't make a passkey (an http page, an old browser).
- **Clear refusals**: banned or suspended accounts, and sign-ins blocked by IP or country rules, each get their own message. Every error step has a way back.
- **Settings that don't load** (a wrong app ID, no connection): an error step with "Try again" instead of an email field that can't work.
- **Accessibility**: labelled fields, the title of each new step takes focus, status lines are live regions, errors are alerts tied to their field, full keyboard use of the code boxes.

### Theming further

Everything is drawn with CSS variables on the root (`.scute-signin`), so you can also set them in your own CSS:

```css
.my-sign-in {
  --scute-bg: #fafafa;          /* page background (layout "page") */
  --scute-panel: #ffffff;       /* fields, card */
  --scute-line: #e4e4e7;        /* borders */
  --scute-ink-strong: #18181b;  /* titles, field text */
  --scute-ink-muted: #52525b;   /* leads */
  --scute-ink-soft: #71717a;    /* hints, links */
  --scute-bad: #b91c1c;         /* errors */
  --scute-accent: #4338ca;      /* primary button */
  --scute-accent-ink: #ffffff;  /* primary button text */
}
```

### Your own illustration

`appearance.illustration` takes any element. To make it follow the flow, read the step with `useScuteSignInStep()`:

```tsx
import { useScuteSignInStep } from "@scute/auth-ui-react";

function Mascot() {
  // view: the flow step ("login", "otp_input", "mfa_verify", ...)
  // mood: "idle" | "working" | "checking" | "locked" | "error" | "success"
  // errorCount: goes up with each failed attempt
  const { mood, errorCount } = useScuteSignInStep();
  return <MyMascot key={errorCount} mood={mood} />;
}

<ScuteSignIn appearance={{ illustration: <Mascot /> }} />;
```

### Previews

`preview` draws one step with sample data and runs nothing: no Scute client or `AuthContextProvider` needed, no requests, no focus taken, buttons that do nothing and codes that are never accepted. Use it for a settings page that previews your sign-in, for docs or for screenshots.

```tsx
// The email step, as your users will see it.
<ScuteSignIn preview="login" appearance={{ layout: "fill", accentColor: "#0f766e" }} copy={{ title: "Sign in to Acme" }} />

// Any step, with its sample data.
<ScuteSignIn preview={{ view: "otp_input", email: "ada@acme.com", error: "Invalid code" }} />
<ScuteSignIn preview={{ view: "mfa_verify", mfaMethod: "totp", mfaMethods: ["totp", "email", "backup_codes"] }} />
<ScuteSignIn preview={{ view: "error", errorCode: "ip_blocked" }} />
```

`ScuteSignInPreview` is `{ view, email?, error?, errorCode?, mfaMethod?, mfaMethods?, verificationMethod?, mfaGraceDaysRemaining?, deviceTrustDays? }`; `view` is any of the flow's steps (listed under [Headless](#headless-usescuteauthflow)).

## ScuteAuthGate

Renders its children once the visitor is signed in, and `ScuteSignIn` until then.

```tsx
import { ScuteAuthGate } from "@scute/auth-ui-react";

<ScuteAuthGate
  appearance={{ logo: "/logo.svg", theme: "auto" }}
  legal={{ termsUrl: "/terms", privacyUrl: "/privacy" }}
  onAuthenticated={(user) => track("signed_in", user.id)}
>
  <App />
</ScuteAuthGate>;
```

| Prop | Type | What it does |
| --- | --- | --- |
| `children` | `ReactNode` | Your app, shown once signed in. |
| `appearance`, `copy`, `legal`, `methods`, `defaultEmail` | as `ScuteSignIn` | Passed to the sign-in. |
| `onAuthenticated` | `(user) => void` | Called once each time the app is shown after a sign-in. |
| `renderView` | `(view, auth) => ReactNode \| null` | Draw a step yourself; return `null` to keep the default for that step. `auth` is the `useScuteAuthFlow()` result. |

## Next.js (App Router)

Create the client once, in a client component:

```tsx
// app/providers.tsx
"use client";

import { useState, type ReactNode } from "react";
import { createClientComponentClient } from "@scute/nextjs-handlers";
import { AuthContextProvider } from "@scute/react-hooks";

export function Providers({ children }: { children: ReactNode }) {
  const [scuteClient] = useState(() =>
    createClientComponentClient({
      appId: process.env.NEXT_PUBLIC_SCUTE_APP_ID,
      baseUrl: process.env.NEXT_PUBLIC_SCUTE_BASE_URL,
    })
  );
  return <AuthContextProvider scuteClient={scuteClient}>{children}</AuthContextProvider>;
}
```

```tsx
// app/layout.tsx
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

```tsx
// app/sign-in/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { ScuteSignIn } from "@scute/auth-ui-react";

export default function SignInPage() {
  const router = useRouter();
  return (
    <ScuteSignIn
      appearance={{ logo: "/logo.svg", theme: "auto" }}
      legal={{ termsUrl: "/terms", privacyUrl: "/privacy" }}
      onSignedIn={() => router.replace("/dashboard")}
    />
  );
}
```

Magic links land on the page set as your app's callback URL: render `ScuteSignIn` (or `ScuteAuthGate`) there too, and it finishes the sign-in.

## React (Vite and others)

```tsx
// main.tsx
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AuthContextProvider, createClient } from "@scute/react-hooks";
import { ScuteAuthGate } from "@scute/auth-ui-react";
import { App } from "./App";

function Root() {
  const [scuteClient] = useState(() =>
    createClient({
      appId: import.meta.env.VITE_SCUTE_APP_ID,
      baseUrl: import.meta.env.VITE_SCUTE_BASE_URL,
    })
  );
  return (
    <AuthContextProvider scuteClient={scuteClient}>
      <ScuteAuthGate appearance={{ theme: "auto", layout: "card" }}>
        <App />
      </ScuteAuthGate>
    </AuthContextProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
```

## Headless: useScuteAuthFlow

`useScuteAuthFlow()` drives the same flow with no UI. Render by `view`:

`loading`, `login`, `magic_pending`, `magic_verifying`, `verification_required`, `otp_input`, `webauthn_verify`, `webauthn_register`, `webauthn_register_success`, `mfa_verify`, `mfa_enroll`, `mfa_enroll_suggest`, `error`, `authenticated`.

It returns the state (`identifier`, `error`, `errorCode`, `submitting`, `resendIn`, `resent`, `resendError`, `verification`, `mfaChallenge`, `mfaAvailableMethods`, `deviceTrustOffered`, `deviceTrustDays`, `trustDevice`, `passkeysSupported`, ...) and the actions (`submitIdentifier`, `submitOtp`, `submitVerificationCode`, `resend`, `submitMfaCode`, `resendMfaCode`, `switchMfaMethod`, `setTrustDevice`, `registerPasskey`, `skipPasskey`, `skipMfaEnrollment`, `signInWithOAuth`, `retry`, `signOut`). `errorCode` carries the API's code for a refusal: `user_banned`, `user_suspended`, `ip_blocked` or `country_blocked`. When the app's settings don't load, the flow starts on `error` with `errorCode` `"app_settings_unavailable"` (exported as `APP_SETTINGS_UNAVAILABLE`), and `retry` loads them again.

## Notes

- The stylesheet is an inline `<style>` element and the theme is set with inline CSS variables. A Content Security Policy that blocks inline styles (`style-src` without `'unsafe-inline'`) blocks them too.
- Passkeys need a secure page (https, or localhost while developing).
