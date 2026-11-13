// The developer in the dashboard (SCUTE_E2E_DASHBOARD_URL): a test identity
// who owns the suite's workspace, signed in with a link made on the server
// (never emailed), on an app's Authentication page.
import { expect, type Browser, type Page } from "@playwright/test";
import { settingsEnv, type Server } from "./fixtures";

export const dashboardUrl = settingsEnv?.dashboardUrl?.replace(/\/$/, "") ?? null;
const WORKSPACE_SLUG = "e2e-mfa-sdk-browser-tests";
const developer = `e2e-mfa-dev-${Date.now().toString(36)}+scute_test@example.com`;

export type Policy = "Off" | "Optional" | "Required";
export type Method = "Authenticator app" | "Email code" | "SMS code" | "Backup codes";

export class Dashboard {
  constructor(readonly page: Page, readonly path: string) {}

  /** Signed in, on the Authentication page of the app with this slug. */
  static async open(browser: Browser, server: Server, appSlug: string) {
    await server.op("ensure_developer", developer);
    const link = await server.op<{ token: string }>("dashboard_magic_link", developer);
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
    await page.goto(`${dashboardUrl}/?sct_magic=${encodeURIComponent(link.token)}`);
    // Signed in: the dashboard offers a passkey first (skipped, as most do),
    // then shows the workspace.
    const workspace = page.getByRole("button", { name: "Switch workspace" });
    const skipPasskey = page.getByRole("button", { name: "Skip for now" });
    await expect(skipPasskey.or(workspace).first()).toBeVisible({ timeout: 45_000 });
    if (await skipPasskey.isVisible()) await skipPasskey.click();
    await expect(workspace).toBeVisible({ timeout: 45_000 });
    const d = new Dashboard(page, `${dashboardUrl}/${WORKSPACE_SLUG}/apps/${appSlug}/authentication`);
    await d.reload();
    return d;
  }

  async reload() {
    // The new dashboard's tour, the first time.
    const skip = this.page.getByText("Skip tour");
    const ready = this.page.getByText("Second step (MFA)").or(skip).first();
    await this.page.goto(this.path);
    // The preview deployment sometimes leaves the page's settings loading
    // (seen once in four runs, the first page of a run): load it once more.
    if (!(await ready.waitFor({ timeout: 45_000 }).then(() => true, () => false))) {
      await this.page.goto(this.path);
      await ready.waitFor({ timeout: 45_000 });
    }
    if (await skip.isVisible()) {
      await this.page.getByText("Don't show again").click();
      await skip.click();
    }
    await expect(this.page.getByText("Second step (MFA)")).toBeVisible({ timeout: 30_000 });
  }

  policy(name: Policy) {
    return this.page.getByRole("radiogroup", { name: "Who's asked for a second step" }).getByRole("radio", { name: new RegExp(`^${name}`) });
  }

  method(name: Method) {
    return this.page.getByRole("switch", { name, exact: true });
  }

  async setPolicy(name: Policy) {
    await this.policy(name).click();
    await expect(this.policy(name)).toHaveAttribute("aria-checked", "true");
  }

  async setMethod(name: Method, on: boolean) {
    const s = this.method(name);
    if ((await s.getAttribute("aria-checked")) !== String(on)) await s.click();
    await expect(s).toHaveAttribute("aria-checked", String(on));
  }

  /** "Time to set it up", in days (Required only). */
  async setGraceDays(days: number) {
    const slider = this.page.getByRole("slider", { name: "Time to set it up, in days" });
    await slider.focus();
    await slider.press("Home");
    for (let i = 0; i < days; i++) await slider.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", String(days));
  }

  saveBar() {
    return this.page.getByRole("region", { name: "Unsaved changes" });
  }

  async save() {
    await this.saveBar().getByRole("button", { name: "Save" }).click();
    await expect(this.page.getByText("Saved. New sign-ins use it right away.")).toBeVisible();
    await expect(this.saveBar()).toHaveCount(0);
  }

  /** A switch by its name: "Passkeys", "A passkey counts as both", ... */
  async setSwitch(name: string, on: boolean) {
    const s = this.page.getByRole("switch", { name, exact: true });
    if ((await s.getAttribute("aria-checked")) !== String(on)) await s.click();
    await expect(s).toHaveAttribute("aria-checked", String(on));
  }

  async close() {
    await this.page.context().close();
  }
}
