import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the multi-app session isolation gate suite.
 *
 * Prereqs (started by the developer before running, not by Playwright):
 *   - Rails API on http://localhost:3333 with two test apps configured
 *     (origin = http://localhost:3004, additional_origins includes it)
 *   - example-apps/nextjs-example running on http://localhost:3004 with
 *     NEXT_PUBLIC_SCUTE_APP_ID = the primary test app id
 *     NEXT_PUBLIC_SCUTE_ALT_APP_ID = the secondary test app id
 *
 * Run from this directory:
 *   pnpm install
 *   pnpm install:browsers
 *   pnpm test
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false, // tests share storage state by design
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.SCUTE_E2E_BASE_URL || "http://localhost:3004",
    apiURL:
      process.env.SCUTE_E2E_API_URL || "http://localhost:3333",
    headless: true,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  } as any,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
