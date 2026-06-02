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
