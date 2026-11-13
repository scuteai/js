// Makes (or resets) the example's Scute app through the broker, then starts
// examples/with-nextjs-mfa-rbac with its id and secret, the way a developer
// runs it (next dev, environment variables, no code changed).
import { spawn } from "node:child_process";
import { openSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadSettingsEnv } from "../settings/lib/env.mjs";

export const STATE = fileURLToPath(new URL("./.state.json", import.meta.url));
export const APP_NAME = "e2e-mfa nextjs example";

export default async function globalSetup() {
  const loaded = loadSettingsEnv();
  if (!loaded.ok) throw new Error(loaded.reason);
  const { env } = loaded;
  if (!env.mailosaur) throw new Error("set MAILOSAUR_SERVER_ID and MAILOSAUR_API_KEY (real inboxes)");
  if (!env.dashboardUrl) throw new Error("set SCUTE_E2E_DASHBOARD_URL");
  const origin = `http://localhost:${env.realAppPort}`;

  const res = await fetch(`http://127.0.0.1:${env.brokerPort}/op`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "ensure_real_app", args: [APP_NAME, origin] }),
  });
  const answer = await res.json();
  if (!answer.ok) throw new Error(`ensure_real_app: ${answer.e}`);
  const app = answer.v as { app_id: string; secret: string; slug: string };

  // Something else on the port would answer the readiness check below and
  // the suite would test it instead of the example.
  const busy = await fetch(origin).then(() => true, () => false);
  if (busy) throw new Error(`port ${env.realAppPort} is already in use: stop what runs on ${origin} first`);

  const dir = fileURLToPath(new URL("../../../../examples/with-nextjs-mfa-rbac/", import.meta.url));
  const log = openSync(fileURLToPath(new URL("./.next-dev.log", import.meta.url)), "w");
  const child = spawn("npx", ["next", "dev", "-p", String(env.realAppPort)], {
    cwd: dir,
    detached: true,
    stdio: ["ignore", log, log],
    env: {
      ...process.env,
      NEXT_PUBLIC_SCUTE_APP_ID: app.app_id,
      NEXT_PUBLIC_SCUTE_BASE_URL: env.apiUrl,
      SCUTE_SECRET: app.secret,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  child.unref();
  writeFileSync(STATE, JSON.stringify({ appId: app.app_id, slug: app.slug, pid: child.pid }));

  // Ready when the sign-in page renders (the first compile is slow).
  const deadline = Date.now() + 180_000;
  for (;;) {
    try {
      const page = await fetch(`${origin}/sign-in`);
      if (page.ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error(`the example app did not start on ${origin} (see real-app/.next-dev.log)`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}
