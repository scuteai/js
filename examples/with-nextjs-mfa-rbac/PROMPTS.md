# Prompts: build this example with a coding agent

Three prompts that get a coding agent to add what this example shows to a Next.js app: sign-in, two-step verification (MFA), and roles with checks on the server. Give them one at a time, in order, and check the agent's work after each.

The walkthrough, with what to click after each prompt and what to do when the agent gets stuck, is in the Scute docs: [Prompt a coding agent](https://docs.scute.io/guides/prompt-an-agent).

## Before you start

1. In the [dashboard](https://control.scute.io), create an app. Add `http://localhost:3000` under **Domains > Allowed domains**, make a key under **API keys > New key**, and copy the App ID from **Overview**.
2. Make a Next.js app (`npx create-next-app@latest acme --yes`), or use yours.
3. Write `.env.local` at its root yourself, so the secret never goes into a chat (see [`env.example`](./env.example)):

   ```bash
   NEXT_PUBLIC_SCUTE_APP_ID=your-app-id
   NEXT_PUBLIC_SCUTE_BASE_URL=https://api.scute.io
   SCUTE_SECRET=your-secret
   ```

## Prompt 1: sign-in

```text
Add Scute sign-in to this Next.js (App Router) app.

Read these first:
- Tutorial, Part 1: https://docs.scute.io/guides/mfa-rbac-tutorial
- Working example: https://github.com/scuteai/js/tree/main/examples/with-nextjs-mfa-rbac (src/app/providers.tsx, src/app/auth/[...scute]/route.ts, src/app/sign-in/, src/lib/session.ts)

Do this:
1. Install the prerelease packages: `npm install @scute/auth-ui-react@next @scute/react-hooks@next @scute/nextjs-handlers@next`. You need at least auth-ui-react 0.4.0-next.5, react-hooks 0.9.0-next.5 and nextjs-handlers 0.9.0-next.6.
2. `.env.local` already has NEXT_PUBLIC_SCUTE_APP_ID, NEXT_PUBLIC_SCUTE_BASE_URL and SCUTE_SECRET. Don't print them or change them. SCUTE_SECRET is for server code only: never prefix it with NEXT_PUBLIC_ and never use it in a "use client" file.
3. `app/providers.tsx` ("use client"): create one browser client with `createClientComponentClient({ appId, baseUrl })` from `@scute/nextjs-handlers` inside `useState(() => ...)`, and pass it to `AuthContextProvider` from `@scute/react-hooks`. Wrap the body in `app/layout.tsx` with it.
4. `app/auth/[...scute]/route.ts`: `const handler = ScuteHandler({ cookies, headers })` (from `@scute/nextjs-handlers`, with `cookies` and `headers` from `next/headers`), exported as GET and POST.
5. `/sign-in`: render `ScuteSignIn` from `@scute/auth-ui-react` in a client component. In `onSignedIn`, call `router.replace("/account")` then `router.refresh()`. Don't build your own sign-in form: ScuteSignIn handles codes, links, passkeys and MFA.
6. `/account`: a server component that reads the session with `createServerComponentClient({ cookies })` and `getUser()`, redirects to `/sign-in` when there is no user, and shows "Signed in as {email}" with a Sign out button (a client component that calls `useScuteClient().signOut()` then goes to `/sign-in`).
7. If `next.config` turns `cacheComponents` on (new apps from create-next-app do), `ScuteSignIn` and every component that reads cookies, the session or `searchParams` must render inside a `<Suspense>` boundary, or `next build` fails. Never fix that with "use cache": the session belongs to one person.

Check your work:
- `npm run build` and `npm run lint` pass.
- Start the dev server. `/account` redirects to `/sign-in`, and `/sign-in` shows the Scute sign-in with an email field.
- Then tell me to open /account and sign in with my email and the code I receive.
```

Check: `/account` sends you to the sign-in; after your email and the code it says **Signed in as** and your email; **Sign out** works.

## Prompt 2: MFA

First, in the dashboard under **Authentication > Second step (MFA)**, set **Who's asked** to Required, turn the **Authenticator app** on, set **Time to set it up** to 7 days, and save.

```text
This Next.js app already signs people in with Scute (`ScuteSignIn` on /sign-in, a protected /account page). Add two-step verification (MFA) with an authenticator app.

Read these first:
- Tutorial, Part 2: https://docs.scute.io/guides/mfa-rbac-tutorial
- Working example: https://github.com/scuteai/js/tree/main/examples/with-nextjs-mfa-rbac (src/app/account/security-settings.tsx)

What is already done: in the Scute dashboard I set MFA to Required, with the authenticator app allowed and a 7-day grace period. `ScuteSignIn` already asks for the second step and shows the grace-period reminder, so don't change the sign-in page and don't build MFA logic yourself.

Do this:
1. `npm install qrcode.react`.
2. Add a client component on /account that uses `useSecureAccount()` from `@scute/auth-ui-react` (it needs the `AuthContextProvider` that is already in the layout):
   - Find the authenticator method: `secure.methods.find((m) => m.key === "totp")`. Show nothing if it is not `allowed`, and "Two-step verification is on." if it is `enrolled`.
   - Otherwise show a "Set up an authenticator app" button that calls `secure.startEnroll("totp")`.
   - Once `secure.provisioningUri` is set, show it as a QR code (`QRCodeSVG` from `qrcode.react`), a field for the 6-digit code and a Verify button that calls `secure.submitCode(code)`.
   - Show `secure.error?.message` when there is one.
3. Keep /account a server page; only this new component is a client component.

Check your work:
- `npm run build` and `npm run lint` pass.
- Start the dev server: signed out, /account still goes to /sign-in.
- Then tell me to: sign in (the sign-in reminds me to set up two-step verification), click "Set up an authenticator app" on /account, scan the QR code with an authenticator app and enter the code, then sign out and sign in again: after the email code it should ask for the authenticator code.
```

Check: the sign-in reminds you to set up two-step verification; on `/account` you scan the QR code and enter the code; after signing out and in again, the sign-in asks for the authenticator code.

## Prompt 3: roles and permissions

```text
This Next.js app already signs people in with Scute and has a protected /account page. Add roles and permissions (RBAC) with Scute: everyone can view projects, only editors can edit them, and the server enforces it.

Read these first:
- Tutorial, Part 3: https://docs.scute.io/guides/mfa-rbac-tutorial
- Working example: https://github.com/scuteai/js/tree/main/examples/with-nextjs-mfa-rbac (scripts/seed-rbac.mjs, src/lib/authz.ts, src/app/projects/, src/app/api/projects/[id]/route.ts)

Do this:
1. `scripts/seed-rbac.mjs`, run with `node --env-file=.env.local scripts/seed-rbac.mjs`. It calls the Scute API at `${NEXT_PUBLIC_SCUTE_BASE_URL}/v1/apps/${NEXT_PUBLIC_SCUTE_APP_ID}/authz` with the header `Authorization: Bearer ${SCUTE_SECRET}`:
   - `POST /resources` `{ slug: "project", actions: ["view", "edit"] }` (makes the permissions `project:view` and `project:edit`)
   - `POST /roles` `{ slug: "viewer", is_default: true, permissions: ["project:view"] }` (everyone who signs in holds it)
   - `POST /roles` `{ slug: "editor", permissions: ["project:view", "project:edit"] }`
   - `PATCH /settings` `{ client_checks: true }` (lets the browser ask about its own permissions)
   Make it safe to run twice: a 422 on a POST means it already exists. Print each call and its status. Run it.
2. `scripts/give-role.mjs`, run with `node --env-file=.env.local scripts/give-role.mjs editor jane@example.com`: find the user with `GET /v1/${appId}/users?q=<email>` (note: no `/apps/` in this path), then `POST /v1/apps/${appId}/authz/users/<user id>/roles` `{ role }`. Print "<email> is now <role>", or that the person must sign in once first.
3. `lib/authz.ts` (server only, starts with `import "server-only"`): a helper that calls `new ScuteAdminApi({ appId, baseUrl, secretKey: process.env.SCUTE_SECRET }).authzCheck({ userId, action, resource: "project" })` from `@scute/nextjs-handlers`. Treat only `data.allowed === true` as yes; an error or no answer is a no.
4. `/projects`: a server page (inside `<Suspense>`, like /account). Signed out: redirect to /sign-in. Check `view` on the server; if refused, show the decision's `explanation`. Otherwise list two sample projects kept in memory, with the ids `website` and `mobile`.
5. `PATCH /api/projects/[id]` with body `{ name }`: read the user with `createRouteHandlerClient({ cookies })` and `getUser()` (401 if none), check `edit` on the server (403 with the explanation if refused), then rename the project.
6. On /projects, an Edit button (a client component) that renames a project through that route. Hide it with `useCan("edit", "project")` from `@scute/react-hooks` and show "View only" instead. This only tidies the page: the server check in step 5 is what protects the data.
Never put SCUTE_SECRET or ScuteAdminApi in a "use client" file.

Check your work:
- `npm run build` and `npm run lint` pass, and the seed prints a status for each call.
- Start the dev server: signed out, /projects goes to /sign-in, and `PATCH /api/projects/<id>` answers 401.
- Then tell me to: sign in and open /projects (I should see "View only"), run `await fetch("/api/projects/website", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Hacked" }) }).then((r) => r.status)` in the browser console (it should say 403), sign in as a second person in a private window, run give-role for them, reload /projects as them (Edit shows and saving works).
```

Check: as yourself, `/projects` says **View only** and the console `fetch` gets `403`; after `give-role.mjs editor` for a second person, they see **Edit** and saving works.
