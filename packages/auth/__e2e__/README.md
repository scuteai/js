# `@scute/sdk-e2e` — multi-app session isolation gate suite

End-to-end tests that exercise the v0.7 per-app storage namespacing in a real Chromium browser. This is the gate suite for the SDK change in [tickets/25-sdk-change-multi-app-session-isolation.md](../../../../tickets/25-sdk-change-multi-app-session-isolation.md).

## What this proves

The Node-side unit tests in `@scute/js-core` (24 tests, runnable via `pnpm --filter @scute/js-core test`) cover the storage helper contract end-to-end at the API level. They do **not** prove that:

- A real browser accepts cookie names with `__` (the namespacing separator).
- A real `BroadcastChannel` respects per-app channel names.
- `document.cookie` round-trips both legacy and namespaced cookies during the v0.7 migration window.
- The SDK build, when loaded into a real Next.js page, writes to namespaced storage slots (and only those).

This suite covers exactly that gap.

## Prereqs

These tests assume two services are already running on the host:

1. **Rails API** at `http://localhost:3333`, with two test apps created in a workspace, both with `origin` set to `http://localhost:3004` (and / or `additional_origins` including it).
2. **`example-apps/nextjs-example`** at `http://localhost:3004`, with `.env.local` containing:
   ```
   NEXT_PUBLIC_SCUTE_APP_ID=<primary test app id>
   NEXT_PUBLIC_SCUTE_BASE_URL=http://localhost:3333
   ```
   Optional, for the dual-app coexistence specs:
   ```
   NEXT_PUBLIC_SCUTE_ALT_APP_ID=<secondary test app id>
   ```

## Run it

```bash
cd js/packages/auth/__e2e__
pnpm install
pnpm install:browsers          # one-time Chromium download
NEXT_PUBLIC_SCUTE_APP_ID=app_xxx \
NEXT_PUBLIC_SCUTE_ALT_APP_ID=app_yyy \
pnpm test
```

Or run a single spec interactively:

```bash
pnpm test:debug -- tests/storage-namespacing.spec.ts
```

## Test surface

| File | Layer | Gate severity |
|------|-------|---------------|
| `tests/storage-namespacing.spec.ts` | Browser storage primitives — `__`-suffix cookies, BroadcastChannel scoping, legacy + namespaced coexistence in `document.cookie` | **Hard gate** — blocks v0.7 tag if any of these fail; means the separator choice or migration semantics are wrong |
| `tests/sdk-runtime.spec.ts` | Real SDK build (linked workspace) in a real page — no multi-instance warning for single client, legacy cookie survives page load, storage writes land in the namespaced slot only | **Hard gate** — proves the integration of the unit-tested helpers with the actual SDK runtime |

## What this suite deliberately doesn't cover

- **Full sign-in / sign-out cycle** — requires SMS OTP delivery, which is out of scope for unit-level E2E. Tracked as a future Playwright spec when a test-mode bypass exists in the Rails API.
- **Cross-browser (Safari ITP, Firefox total cookie protection)** — Chromium only here. Multi-browser smoke runs pre-tag against staging, not on every PR.
- **HTTPS / `SameSite=None; Secure`** — localhost-only. Tagged for the staging smoke.

## Wiring this into CI

Add a job that boots Rails (test mode), boots the example app, runs `pnpm test`. Recommended split from the unit `pnpm test` to keep the unit loop fast.

---

# Settings suite: every sign-in and MFA setting, in real browsers

`settings/` drives `ScuteSignIn` and the SDK (the packages' built `dist`, as
an app ships them) in Chromium and WebKit against a real Scute API, and
changes the app's settings between tests the way the dashboard does
(`PATCH /v1/apps/:id`). It covers: email codes, sign-in links (the waiting
page and the landing page), passkeys (Chromium's virtual authenticator),
MFA policy, methods, switching, backup codes and the grace period, session
lifetimes, refresh and sign-out, sessions ended on the server, refusals
(sign-up off, banned, suspended, deactivated, IP rules, rate limits, attack
protection's code step), the device fingerprint and trusted devices, and,
read only, a dashboard's sign-in page.

It never runs against production (it refuses `api.scute.io`) and never
emails or texts anyone: every address is a test identity
(`...+scute_test@example.com`, code `424242`, the app has `test_identities`
on), and sign-in links are made on the server and opened by the test.

## What it needs

- A Scute API that allows test identities (a sandbox workspace, or
  `SCUTE_TEST_IDENTITIES=enabled`).
- A way to run `rails runner` on that API. The suite keeps one runner up for
  the whole run and only calls the operations in `settings/lib/server.rb`,
  which touch nothing but the suite's own workspace
  (`e2e-mfa SDK browser tests`), its app (`e2e-mfa sdk browser`, origin
  `http://localhost:4317`) and the people the tests sign up.

Configuration (environment variables, or a `KEY=VALUE` file outside the repo
at `SCUTE_E2E_ENV_FILE`, default `../.sdk-live/e2e.env` next to the js
checkout; never commit it):

| Variable | |
| --- | --- |
| `SCUTE_E2E_API_URL` | The API's base URL |
| `SCUTE_E2E_CONSOLE` | The command that runs `rails runner` there; `{script}` is replaced by the (quoted) script, e.g. `cd ../api && bin/rails runner {script}` |
| `SCUTE_E2E_PORT` | The test page's port (default 4317) |
| `SCUTE_E2E_BROKER_PORT` | The local runner broker's port (default 4318) |
| `SCUTE_E2E_DASHBOARD_URL` | Optional: a dashboard whose sign-in is checked, read only |

## Run it

```bash
pnpm test:e2e:settings            # from the repo root: builds the packages, then runs
# or, in packages/auth/__e2e__ after a build:
pnpm test:settings
pnpm test:settings -- --project chromium mfa   # one browser, one file
```

Playwright starts the test page (Vite, `settings/app`) and the runner
broker (`settings/lib/broker.mjs`, about 30 seconds to start). Tests run one
at a time: they share one app and reset its settings first. Tests tagged
`@webkit` also run in WebKit. Each test fails if its page sends more than
150 API requests (a refresh or poll loop).
