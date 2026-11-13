// MFA from a developer's side: the developer turns it on in the dashboard
// (SCUTE_E2E_DASHBOARD_URL, its app's Authentication page) and their app,
// built on ScuteSignIn and the SDK, meets the result against the same API.
// The developer is a test identity who owns the suite's workspace; the
// dashboard sign-in link is made on the server, never emailed.
import type { Browser, Page } from "@playwright/test";
import {
  enrollTotp,
  expect,
  expectNoSession,
  makeBackupCodes,
  newEmail,
  nextTotp,
  settingsEnv,
  test,
  type AppSettings,
  type Factors,
  type Server,
  type SignInPage,
} from "../lib/fixtures";

const dashboard = settingsEnv?.dashboardUrl?.replace(/\/$/, "");
const WORKSPACE_SLUG = "e2e-mfa-sdk-browser-tests";
const developer = `e2e-mfa-dev-${Date.now().toString(36)}+scute_test@example.com`;

type Policy = "Off" | "Optional" | "Required";
type Method = "Authenticator app" | "Email code" | "SMS code" | "Backup codes";

/** The developer, signed in to the dashboard on the app's Authentication page. */
class Dashboard {
  constructor(readonly page: Page, readonly path: string) {}

  static async open(browser: Browser, server: Server, settings: AppSettings) {
    await server.op("ensure_developer", developer);
    const link = await server.op<{ token: string }>("dashboard_magic_link", developer);
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
    await page.goto(`${dashboard}/?sct_magic=${encodeURIComponent(link.token)}`);
    // Signed in: the dashboard offers a passkey first (skipped, as most do),
    // then shows the workspace.
    const workspace = page.getByRole("button", { name: "Switch workspace" });
    const skipPasskey = page.getByRole("button", { name: "Skip for now" });
    await expect(skipPasskey.or(workspace).first()).toBeVisible({ timeout: 45_000 });
    if (await skipPasskey.isVisible()) await skipPasskey.click();
    await expect(workspace).toBeVisible({ timeout: 45_000 });
    const { slug } = await settings.read();
    const d = new Dashboard(page, `${dashboard}/${WORKSPACE_SLUG}/apps/${slug}/authentication`);
    await d.reload();
    return d;
  }

  async reload() {
    await this.page.goto(this.path);
    // The new dashboard's tour, the first time.
    const skip = this.page.getByText("Skip tour");
    await this.page.getByText("Second step (MFA)").or(skip).first().waitFor({ timeout: 45_000 });
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

  async close() {
    await this.page.context().close();
  }
}

async function signOut(signin: SignInPage) {
  await signin.page.getByTestId("sign-out").click();
  await signin.expectView("login");
  await signin.expectSignedOut();
}

test.describe("MFA set in the dashboard, met by the developer's app", () => {
  test.skip(!dashboard, "SCUTE_E2E_DASHBOARD_URL is not set");

  test("Required with an authenticator app: new users are nudged, set it up, then every sign-in asks", async ({
    browser,
    server,
    settings,
    signin,
  }) => {
    const dash = await Dashboard.open(browser, server, settings);
    await expect(dash.policy("Off")).toHaveAttribute("aria-checked", "true");
    await dash.setPolicy("Required");
    await dash.setMethod("Authenticator app", true);
    await dash.setMethod("Backup codes", true);
    await dash.setMethod("Email code", false);
    await dash.setMethod("SMS code", false);
    await dash.save();

    // Saved for real: the page after a reload, and the API the SDK talks to.
    await dash.reload();
    await expect(dash.policy("Required")).toHaveAttribute("aria-checked", "true");
    await expect(dash.method("Email code")).toHaveAttribute("aria-checked", "false");
    const app = await settings.read();
    expect(app.mfa_policy).toBe("required");
    expect([...app.mfa_methods_allowed].sort()).toEqual(["backup_codes", "totp"]);
    await dash.close();

    // A new user of the developer's app, inside the default grace period.
    const email = newEmail("dev-mfa");
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectView("mfa_enroll_suggest");
    await signin.page.getByRole("button", { name: "Continue" }).click();
    await signin.expectSignedIn(email);

    // The developer's "set up two-step" screen: the SDK.
    const factors: Factors = {};
    const emailRefused = await signin.client(
      (c, e) => c.enrollMfa({ method: "email", secret_data: e }).then((r: any) => r.error?.json?.error_code ?? r.error?.code ?? null),
      email
    );
    expect(emailRefused, "email codes were switched off in the dashboard").toBe("method_not_allowed");
    await enrollTotp(signin, factors);
    await makeBackupCodes(signin, factors);
    expect((await server.userState(email)).mfa).toContain("totp");
    await signOut(signin);

    // Next sign-in: the authenticator code, nothing before it.
    await signin.signInWithCode(email);
    await signin.expectView("mfa_verify");
    await expect(signin.page.getByRole("button", { name: "Email code" })).toHaveCount(0);
    await expectNoSession(signin);
    await signin.typeCode("000000");
    await expect(signin.page.locator("#scute-signin-mfa-error")).toContainText("That code didn't work");
    await expectNoSession(signin);
    await signin.typeCode(await nextTotp(factors));
    await signin.expectSignedIn(email);
    await signOut(signin);

    // Phone lost: a backup code.
    await signin.signInWithCode(email);
    await signin.expectView("mfa_verify");
    await signin.page.getByRole("button", { name: "Backup code" }).click();
    await expect(signin.page.getByText(/8-character backup codes/)).toBeVisible();
    await signin.typeCode(factors.backupCodes![0]);
    await signin.expectSignedIn(email);
  });

  test("turned Off again in the dashboard: a set-up factor is no longer asked for", async ({
    browser,
    server,
    settings,
    signin,
  }) => {
    const email = newEmail("dev-mfa-off");
    const factors: Factors = {};
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectSignedIn(email);
    await enrollTotp(signin, factors);
    await signOut(signin);

    const dash = await Dashboard.open(browser, server, settings);
    await dash.setPolicy("Required");
    await dash.save();
    await signin.signInWithCode(email);
    await signin.expectView("mfa_verify");
    await signin.typeCode(await nextTotp(factors));
    await signin.expectSignedIn(email);
    await signOut(signin);

    await dash.reload();
    await dash.setPolicy("Off");
    await dash.save();
    expect((await settings.read()).mfa_policy).toBe("disabled");
    await dash.close();
    await signin.signInWithCode(email);
    await signin.expectView("authenticated");
    await signin.expectSignedIn(email);
  });

  test("Optional in the dashboard: only users who set it up are asked", async ({ browser, server, settings, signin }) => {
    const dash = await Dashboard.open(browser, server, settings);
    await dash.setPolicy("Optional");
    await dash.save();
    await dash.close();

    const without = newEmail("dev-mfa-opt-no");
    await signin.open();
    await signin.signInWithCode(without);
    await signin.expectView("authenticated");
    const factors: Factors = {};
    await enrollTotp(signin, factors);
    await signOut(signin);

    await signin.signInWithCode(without);
    await signin.expectView("mfa_verify");
    await signin.typeCode(await nextTotp(factors));
    await signin.expectSignedIn(without);
  });

  test("Required with 0 days to set it up: a new user sets up an authenticator inside the sign-in", async ({
    browser,
    server,
    settings,
    signin,
  }) => {
    const dash = await Dashboard.open(browser, server, settings);
    await dash.setPolicy("Required");
    await dash.setMethod("Authenticator app", true);
    await dash.setMethod("SMS code", false);
    await dash.setMethod("Email code", false);
    await dash.setGraceDays(0);
    await dash.save();
    expect((await settings.read()).mfa_grace_period_days).toBe(0);
    await dash.close();

    // The dashboard's hint: "0 asks on their next sign-in". ScuteSignIn
    // makes them set it up before there is any session.
    const email = newEmail("dev-mfa-nograce");
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectView("mfa_enroll");
    await expect(signin.page.getByText("Your account needs a second step to sign in.")).toBeVisible();
    await expect(signin.page.getByRole("button", { name: "Text message" }), "SMS was switched off in the dashboard").toHaveCount(0);
    await signin.expectSignedOut();
    await expectNoSession(signin);

    await signin.page.getByRole("group", { name: "Second step" }).getByRole("button", { name: "Authenticator app" }).click();
    const key = signin.page.locator(".scute-signin__token").first();
    await expect(key).toBeVisible();
    const factors: Factors = { totpSecret: (await key.innerText()).trim() };
    await signin.typeCode("000000");
    await expect(signin.page.getByText("That code didn't work. Try again.")).toBeVisible();
    await signin.expectSignedOut();
    await signin.typeCode(await nextTotp(factors));
    await signin.expectSignedIn(email);
    expect((await server.userState(email)).mfa).toContain("totp");
    await signOut(signin);

    await signin.signInWithCode(email);
    await signin.expectView("mfa_verify");
    await signin.typeCode(await nextTotp(factors));
    await signin.expectSignedIn(email);
  });

  test("the dashboard won't save Required with nothing to use", async ({ browser, server, settings }) => {
    const dash = await Dashboard.open(browser, server, settings);
    await dash.setPolicy("Required");
    for (const m of ["Authenticator app", "Email code", "SMS code", "Backup codes"] as Method[]) await dash.setMethod(m, false);
    await expect(dash.saveBar()).toContainText("MFA is on with nothing to use");
    await dash.saveBar().getByRole("button", { name: "Save" }).click();
    await expect(dash.page.getByText("Pick at least one second step, or turn MFA off")).toBeVisible();
    expect((await settings.read()).mfa_policy).toBe("disabled");
    await dash.close();
  });
});
