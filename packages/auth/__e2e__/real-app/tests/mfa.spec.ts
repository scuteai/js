// MFA in a real app: examples/with-nextjs-mfa-rbac, unchanged, against the
// settings suite's API. The developer sets MFA in the dashboard; the end user
// signs in with the code from a real inbox (Mailosaur), sets up a second step
// on the app's /account page, and opens its server-protected pages.
import { readFileSync } from "node:fs";
import { expect, test as base, type Browser, type CDPSession, type Page } from "@playwright/test";
import { STATE } from "../global-setup";
import { Dashboard } from "../../settings/lib/dashboard";
import { Server, settingsEnv } from "../../settings/lib/fixtures";
import { newInbox, waitForCode } from "../../settings/lib/mailosaur";
import { freshTotp } from "../../settings/lib/totp";

type App = { appId: string; slug: string };

const test = base.extend<{ app: App; server: Server }>({
  app: async ({}, use) => {
    await use(JSON.parse(readFileSync(STATE, "utf8")));
  },
  server: async ({ app }, use) => {
    const server = new Server({ apiUrl: settingsEnv!.apiUrl, appId: app.appId, secret: "" });
    await server.op("reset_real_app", app.appId);
    await use(server);
  },
});

/** An authenticator app: the key from the setup screen, never the same code twice. */
class Authenticator {
  private lastStep?: number;
  constructor(readonly secret: string) {}
  async code() {
    const { code, step } = await freshTotp(this.secret, this.lastStep);
    this.lastStep = step;
    return code;
  }
}

/** The developer's dashboard, opened for one change and closed again. */
async function inDashboard(browser: Browser, server: Server, app: App, change: (d: Dashboard) => Promise<void>) {
  const d = await Dashboard.open(browser, server, app.slug);
  await change(d);
  await d.save();
  await d.close();
}

const view = (page: Page) => page.locator("[data-scute-view]");
const expectView = (page: Page, name: string, timeout = 30_000) =>
  expect(view(page)).toHaveAttribute("data-scute-view", name, { timeout });

async function pace() {
  await fetch(`http://127.0.0.1:${settingsEnv!.brokerPort}/pace`, { method: "POST", body: "{}" });
}

/** Type into ScuteSignIn's code boxes (they send themselves once full). */
async function typeCode(page: Page, code: string) {
  await view(page).locator("input:not([type=checkbox])").first().fill(code);
}

/**
 * Open a protected page signed out: the server sends the visitor to the
 * sign-in. Email, then the code from the inbox.
 */
async function signInWithEmail(page: Page, email: string, path = "/account") {
  await page.goto(path);
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await expectView(page, "login");
  await pace();
  const sent = new Date(Date.now() - 5_000);
  await page.locator("#scute-signin-email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expectView(page, "otp_input");
  await typeCode(page, await waitForCode(email, sent));
}

async function expectOnAccount(page: Page, email: string) {
  await expect(page).toHaveURL(/\/account$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.locator("header")).toContainText(email);
}

async function signOut(page: Page) {
  await page.getByTestId("sign-out").click();
  await expect(page.locator("header").getByRole("link", { name: "Sign in" })).toBeVisible();
  // Signed out for the server too.
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in\?next=/);
}

function methodRow(page: Page, key: string) {
  return page.locator(`li.method[data-method="${key}"]`);
}

/** On /account: set up the authenticator app from its key, as a person would. */
async function setUpAuthenticator(page: Page) {
  const row = methodRow(page, "totp");
  await row.getByRole("button", { name: "Set up" }).click();
  const key = (await row.getByTestId("totp-secret").innerText()).trim();
  const auth = new Authenticator(key);
  await row.getByLabel("6-digit code").fill("000000");
  await row.getByRole("button", { name: "Verify" }).click();
  await expect(row.getByRole("alert")).toBeVisible();
  await row.getByLabel("6-digit code").fill(await auth.code());
  await row.getByRole("button", { name: "Verify" }).click();
  await expect(row.getByRole("status")).toContainText("is on");
  await row.getByRole("button", { name: "Done" }).click();
  await expect(row.locator(".badge")).toHaveText("On");
  return auth;
}

async function makeBackupCodes(page: Page) {
  const row = methodRow(page, "backup_codes");
  await row.getByRole("button", { name: "Make backup codes" }).click();
  await expect(row.getByTestId("backup-codes").locator("code").first()).toBeVisible();
  const codes = (await row.getByTestId("backup-codes").locator("code").allInnerTexts()).map((c) => c.trim());
  expect(codes.length).toBeGreaterThan(0);
  await row.getByRole("button", { name: "I saved them" }).click();
  await expect(row.locator(".badge")).toHaveText(`${codes.length} left`);
  return codes;
}

async function virtualAuthenticator(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return cdp;
}

test.describe("MFA in the Next.js example app, real inboxes", () => {
  test("Required, 7 days to set it up: nudged, sets up an authenticator on /account, then every sign-in asks", async ({
    page,
    browser,
    server,
    app,
  }) => {
    await inDashboard(browser, server, app, async (d) => {
      await d.setPolicy("Required");
      await d.setMethod("Authenticator app", true);
      await d.setMethod("Backup codes", true);
      await d.setMethod("Email code", false);
      await d.setMethod("SMS code", false);
      await d.setGraceDays(7);
    });

    const email = newInbox("required");
    await signInWithEmail(page, email);
    await expectView(page, "mfa_enroll_suggest");
    await expect(page.getByText(/will soon need a second step to sign in \(in 7 days\)/)).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expectOnAccount(page, email);
    await expect(page.getByRole("status").filter({ hasText: "This app requires a second step." })).toBeVisible();
    // Only what the dashboard allows is offered.
    await expect(methodRow(page, "email")).toHaveCount(0);
    await expect(methodRow(page, "sms")).toHaveCount(0);

    const auth = await setUpAuthenticator(page);
    const backup = await makeBackupCodes(page);
    await expect(page.getByText("This app requires a second step.")).toHaveCount(0);
    await signOut(page);

    // Next sign-in: the authenticator code before any session.
    await signInWithEmail(page, email);
    await expectView(page, "mfa_verify");
    await expect(page.getByText("Enter the 6-digit code from your authenticator app.")).toBeVisible();
    const sameBrowser = await page.context().newPage();
    await sameBrowser.goto("/account");
    await expect(sameBrowser, "no session before the second step").toHaveURL(/\/sign-in\?next=/);
    await sameBrowser.close();
    await typeCode(page, "000000");
    await expect(page.locator("#scute-signin-mfa-error")).toContainText("That code didn't work");
    await typeCode(page, await auth.code());
    await expectOnAccount(page, email);
    await page.getByRole("link", { name: "Projects" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await signOut(page);

    // Phone lost: a backup code, once.
    await signInWithEmail(page, email);
    await expectView(page, "mfa_verify");
    await page.getByRole("button", { name: "Backup code" }).click();
    await expect(page.getByText(/8-character backup codes/)).toBeVisible();
    await typeCode(page, backup[0]);
    await expectOnAccount(page, email);
    await expect(methodRow(page, "backup_codes").locator(".badge")).toHaveText(`${backup.length - 1} left`);
    await signOut(page);

    await signInWithEmail(page, email);
    await expectView(page, "mfa_verify");
    await page.getByRole("button", { name: "Backup code" }).click();
    await expect(page.getByText(/8-character backup codes/)).toBeVisible();
    await typeCode(page, backup[0]);
    await expect(page.locator("#scute-signin-mfa-error"), "a used backup code").toBeVisible();
    await expectView(page, "mfa_verify");
  });

  test("Required, 0 days: a new user sets up the authenticator inside the sign-in", async ({ page, browser, server, app }) => {
    await inDashboard(browser, server, app, async (d) => {
      await d.setPolicy("Required");
      await d.setMethod("Authenticator app", true);
      await d.setMethod("Email code", false);
      await d.setMethod("SMS code", false);
      await d.setGraceDays(0);
    });

    const email = newInbox("nograce");
    await signInWithEmail(page, email);
    await expectView(page, "mfa_enroll");
    await expect(page.getByText("Your account needs a second step to sign in.")).toBeVisible();
    await page.getByRole("group", { name: "Second step" }).getByRole("button", { name: "Authenticator app" }).click();
    const key = page.locator(".scute-signin__token").first();
    await expect(key).toBeVisible();
    const auth = new Authenticator((await key.innerText()).trim());
    await typeCode(page, await auth.code());
    await expectOnAccount(page, email);
    await expect(methodRow(page, "totp").locator(".badge")).toHaveText("On");
    await signOut(page);

    await signInWithEmail(page, email);
    await expectView(page, "mfa_verify");
    await typeCode(page, await auth.code());
    await expectOnAccount(page, email);
  });

  test("Optional, then Off: asked only once set up, and not at all when turned off", async ({ page, browser, server, app }) => {
    await inDashboard(browser, server, app, async (d) => {
      await d.setPolicy("Optional");
      await d.setMethod("Authenticator app", true);
    });

    const email = newInbox("optional");
    await signInWithEmail(page, email);
    await expectOnAccount(page, email);
    await expect(page.getByText("This app requires a second step.")).toHaveCount(0);
    const auth = await setUpAuthenticator(page);
    await signOut(page);

    await signInWithEmail(page, email);
    await expectView(page, "mfa_verify");
    await typeCode(page, await auth.code());
    await expectOnAccount(page, email);
    await signOut(page);

    await inDashboard(browser, server, app, async (d) => d.setPolicy("Off"));
    await signInWithEmail(page, email);
    await expectOnAccount(page, email);
  });

  test("A passkey counts as both: a passkey sign-in skips the second step, until the developer turns it off", async ({
    page,
    browser,
    server,
    app,
  }) => {
    await virtualAuthenticator(page);
    await inDashboard(browser, server, app, async (d) => {
      await d.setSwitch("Passkeys", true);
      await d.setPolicy("Required");
      await d.setMethod("Authenticator app", true);
      await d.setGraceDays(7);
      await d.setSwitch("A passkey counts as both", true);
    });

    // Sign up, set up the authenticator, add a passkey on /account.
    const email = newInbox("passkey");
    await signInWithEmail(page, email);
    // After the code: the passkey offer (skipped for now) and the
    // grace-period nudge, in whichever order the sign-in shows them.
    await expect(view(page)).not.toHaveAttribute("data-scute-view", "otp_input");
    for (let i = 0; i < 4 && !/\/account$/.test(page.url()); i++) {
      const current = await view(page).getAttribute("data-scute-view").catch(() => null);
      if (current === "webauthn_register") await page.getByRole("button", { name: "Skip for now" }).click();
      else if (current === "mfa_enroll_suggest") await page.getByRole("button", { name: "Continue" }).click();
      else await page.waitForTimeout(500);
      if (current) await expect(view(page)).not.toHaveAttribute("data-scute-view", current, { timeout: 30_000 }).catch(() => {});
    }
    await expectOnAccount(page, email);
    const auth = await setUpAuthenticator(page);
    const passkey = methodRow(page, "passkey");
    await passkey.getByRole("button", { name: "Add a passkey" }).click();
    await expect(passkey.getByRole("status")).toContainText("is on");
    await passkey.getByRole("button", { name: "Done" }).click();
    await signOut(page);

    // The passkey alone: no code, no second step.
    await page.goto("/account");
    await expectView(page, "login");
    await pace();
    await page.locator("#scute-signin-email").fill(email);
    await page.getByRole("button", { name: "Continue" }).click();
    await expectOnAccount(page, email);
    await signOut(page);

    // Turned off: the passkey, then the authenticator code.
    await inDashboard(browser, server, app, (d) => d.setSwitch("A passkey counts as both", false));
    await page.goto("/account");
    await expectView(page, "login");
    await pace();
    await page.locator("#scute-signin-email").fill(email);
    await page.getByRole("button", { name: "Continue" }).click();
    await expectView(page, "mfa_verify");
    await typeCode(page, await auth.code());
    await expectOnAccount(page, email);
  });
});
