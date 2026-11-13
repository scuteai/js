// MFA from a developer's side: the developer turns it on in the dashboard
// (SCUTE_E2E_DASHBOARD_URL, its app's Authentication page) and their app,
// built on ScuteSignIn and the SDK, meets the result against the same API.
import type { Browser } from "@playwright/test";
import { Dashboard as Dash, dashboardUrl as dashboard, type Method } from "../lib/dashboard";
import {
  enrollTotp,
  expect,
  expectNoSession,
  makeBackupCodes,
  newEmail,
  nextTotp,
  test,
  type AppSettings,
  type Factors,
  type Server,
  type SignInPage,
} from "../lib/fixtures";

const Dashboard = {
  open: async (browser: Browser, server: Server, settings: AppSettings) => Dash.open(browser, server, (await settings.read()).slug),
};

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

  // D22: an email code isn't a second step after an email sign-in. The
  // dashboard warns (doesn't block) and the sign-in refuses with a reason.
  test("Required with only email codes: the dashboard warns, and an email sign-in can't finish", async ({
    browser,
    server,
    settings,
    signin,
  }) => {
    const dash = await Dashboard.open(browser, server, settings);
    await dash.setPolicy("Required");
    await dash.setMethod("Email code", true);
    for (const m of ["Authenticator app", "SMS code", "Backup codes"] as Method[]) await dash.setMethod(m, false);
    await expect(dash.page.getByText("People who sign in by email can't finish")).toBeVisible();
    await expect(dash.saveBar()).toContainText("Email sign-ins can't finish MFA");
    await dash.setGraceDays(0);
    await dash.save();
    const app = await settings.read();
    expect(app.mfa_policy).toBe("required");
    expect(app.mfa_methods_allowed).toEqual(["email"]);
    await dash.close();

    const email = newEmail("dev-mfa-email-only");
    await signin.open();
    await signin.signInWithCode(email);
    // REFUSALS.mfa_method_unavailable, under the code it refused.
    await expect(signin.page.getByText("can't be set up for this way of signing in")).toBeVisible();
    await signin.expectSignedOut();
    await expectNoSession(signin);
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
