// The dashboard's own sign-in (SCUTE_E2E_DASHBOARD_URL), read only: nothing
// is submitted and no setting of its app changes.
import { expect, test } from "@playwright/test";
import { settingsEnv } from "../lib/fixtures";

const dashboard = settingsEnv?.dashboardUrl;

test.describe("Dashboard sign-in (read only)", () => {
  test.skip(!dashboard, "SCUTE_E2E_DASHBOARD_URL is not set");

  /** The dashboard's app id, from the app config request its sign-in makes. */
  async function openSignIn(page: import("@playwright/test").Page) {
    let appId: string | null = null;
    page.on("request", (r) => {
      const m = /\/v1\/apps\/(app_[A-Za-z0-9]+)/.exec(r.url());
      if (m) appId = m[1];
    });
    await page.goto(dashboard!);
    await expect(page.locator("[data-scute-view]")).toHaveAttribute("data-scute-view", "login", { timeout: 30_000 });
    return () => appId;
  }

  test("shows the sign-in form, with no spinner left @webkit", async ({ page }) => {
    await openSignIn(page);
    await expect(page.locator("#scute-signin-email")).toBeVisible();
    await page.waitForTimeout(2_000);
    await expect(page.locator(".scute-signin__waiting")).toHaveCount(0);
  });

  test("a dead session cookie: back to the sign-in form, not stuck on 'Signing you in' @webkit", async ({
    page,
    context,
  }) => {
    const appIdOf = await openSignIn(page);
    const appId = appIdOf();
    const url = new URL(dashboard!).origin;
    // Tokens that look real but no server knows (a session ended elsewhere).
    const fake = (exp: number) =>
      `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify({ uid: "00000000-0000-0000-0000-000000000000", aid: appId, exp })).toString("base64url")}.c2ln`;
    const names = ["sc-access-token", "sc-refresh-token"].flatMap((n) => (appId ? [`${n}__${appId}`, n] : [n]));
    await context.addCookies(
      names.map((name) => ({
        name,
        value: fake(name.includes("access") ? Math.floor(Date.now() / 1000) - 60 : Math.floor(Date.now() / 1000) + 3600),
        url,
      }))
    );
    await page.reload();
    await expect(page.locator("[data-scute-view]")).toHaveAttribute("data-scute-view", "login", { timeout: 30_000 });
    await page.waitForTimeout(3_000);
    await expect(page.locator(".scute-signin__waiting")).toHaveCount(0);
    await expect(page.getByText("Signing you in")).toHaveCount(0);
  });
});
