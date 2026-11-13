import { defineConfig, devices } from "@playwright/test";
import { loadSettingsEnv } from "./settings/lib/env.mjs";

/**
 * The real-app suite: examples/with-nextjs-mfa-rbac, unchanged, run locally
 * against the settings suite's API; the developer changes MFA in the
 * dashboard and an end user signs in with codes from real inboxes. See
 * README.md ("Real-app suite").
 */
const loaded = loadSettingsEnv();
const env = loaded.ok ? loaded.env : { brokerPort: 4318, realAppPort: 3000 };
if (!loaded.ok) console.warn(`[real-app] ${loaded.reason}`);

export default defineConfig({
  testDir: "./real-app/tests",
  outputDir: "./real-app/.results",
  globalSetup: "./real-app/global-setup.ts",
  globalTeardown: "./real-app/global-teardown.ts",
  timeout: 300_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${env.realAppPort}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "node settings/lib/broker.mjs",
      url: `http://127.0.0.1:${env.brokerPort}/health`,
      timeout: 180_000,
      reuseExistingServer: true,
      stdout: "pipe",
    },
  ],
});
