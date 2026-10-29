import { defineConfig, devices } from "@playwright/test";
import { loadSettingsEnv } from "./settings/lib/env.mjs";

/**
 * The settings suite: ScuteSignIn and the SDK in real browsers against a
 * real Scute API, for every sign-in and MFA setting an app has. See
 * README.md ("Settings suite") for what it needs.
 *
 * One worker: the tests change one app's settings in turn.
 */
const loaded = loadSettingsEnv();
const env = loaded.ok ? loaded.env : { pagePort: 4317, brokerPort: 4318 };
if (!loaded.ok) console.warn(`[settings] ${loaded.reason}`);

export default defineConfig({
  testDir: "./settings/tests",
  outputDir: "./settings/.results",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${env.pagePort}`,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node settings/lib/broker.mjs",
      url: `http://127.0.0.1:${env.brokerPort}/health`,
      timeout: 180_000,
      reuseExistingServer: true,
      stdout: "pipe",
    },
    {
      command: "vite --config settings/vite.config.mjs",
      url: `http://localhost:${env.pagePort}/`,
      timeout: 60_000,
      reuseExistingServer: true,
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, grep: /@webkit/ },
  ],
});
