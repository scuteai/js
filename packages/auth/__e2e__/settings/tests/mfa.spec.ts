// MFA policy, methods and grace period, as ScuteSignIn and the SDK meet them.
import {
  enrollEmail,
  enrollTotp,
  expect,
  expectNoSession,
  makeBackupCodes,
  newEmail,
  nextTotp,
  test,
  TEST_CODE,
  type Factors,
  type SignInPage,
} from "../lib/fixtures";

async function signOut(signin: SignInPage) {
  await signin.page.getByTestId("sign-out").click();
  await signin.expectView("login");
  await signin.expectSignedOut();
}

/** A person with TOTP (and more, when asked), signed out again. */
async function personWithFactors(signin: SignInPage, email: string, extra: { emailFactor?: boolean; backup?: boolean } = {}) {
  const factors: Factors = {};
  await signin.open();
  await signin.signInWithCode(email);
  await signin.expectSignedIn(email);
  await enrollTotp(signin, factors);
  if (extra.emailFactor) await enrollEmail(signin, email);
  if (extra.backup) await makeBackupCodes(signin, factors);
  await signOut(signin);
  return factors;
}

test.describe("MFA", () => {
  test("required with TOTP: no session until the code, a wrong code is refused, the right one signs in @webkit", async ({
    signin,
    settings,
  }) => {
    const email = newEmail("mfa-req");
    const factors = await personWithFactors(signin, email);
    await settings.update({ mfa_policy: "required" });

    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectView("mfa_verify");
    await expect(signin.page.getByText("Enter the 6-digit code from your authenticator app.")).toBeVisible();
    await signin.expectSignedOut();
    await expectNoSession(signin);

    await signin.typeCode("000000");
    await expect(signin.page.locator("#scute-signin-mfa-error")).toContainText("That code didn't work");
    await signin.expectView("mfa_verify");
    await expectNoSession(signin);

    await signin.typeCode(await nextTotp(factors));
    await signin.expectView("authenticated");
    await signin.expectSignedIn(email);
  });

  test("required: reloading on the MFA step does not sign in", async ({ signin, settings }) => {
    const email = newEmail("mfa-reload");
    await personWithFactors(signin, email);
    await settings.update({ mfa_policy: "required" });

    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectView("mfa_verify");
    await signin.page.reload();
    await signin.expectView("login");
    await signin.expectSignedOut();
    await expectNoSession(signin);
  });

  test("optional: asks only people who set up a factor", async ({ signin, settings }) => {
    const withFactor = newEmail("mfa-opt-yes");
    const factors = await personWithFactors(signin, withFactor);
    await settings.update({ mfa_policy: "optional" });

    const without = newEmail("mfa-opt-no");
    await signin.open();
    await signin.signInWithCode(without);
    await signin.expectView("authenticated");
    await signOut(signin);

    await signin.signInWithCode(withFactor);
    await signin.expectView("mfa_verify");
    await signin.typeCode(await nextTotp(factors));
    await signin.expectSignedIn(withFactor);
  });

  test("disabled: a factor that is set up is not asked for", async ({ signin, settings }) => {
    const email = newEmail("mfa-off");
    await personWithFactors(signin, email);
    await settings.update({ mfa_policy: "disabled" });
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectView("authenticated");
    await signin.expectSignedIn(email);
  });

  test("switch to an email code, then (next sign-in) to a backup code", async ({ signin, settings }) => {
    const email = newEmail("mfa-switch");
    const factors = await personWithFactors(signin, email, { emailFactor: true, backup: true });
    await settings.update({ mfa_policy: "required" });

    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectView("mfa_verify");
    await signin.page.getByRole("button", { name: "Email code" }).click();
    await expect(signin.page.getByText("Enter the 6-digit code we just emailed you.")).toBeVisible();
    await signin.typeCode(TEST_CODE);
    await signin.expectSignedIn(email);
    await signOut(signin);

    await signin.signInWithCode(email);
    await signin.expectView("mfa_verify");
    await signin.page.getByRole("button", { name: "Backup code" }).click();
    await expect(signin.page.getByText(/8-character backup codes/)).toBeVisible();
    await signin.typeCode(factors.backupCodes![0]);
    await signin.expectSignedIn(email);
  });

  test("an email code can be sent again", async ({ signin, settings }) => {
    const email = newEmail("mfa-resend");
    await personWithFactors(signin, email, { emailFactor: true });
    await settings.update({ mfa_policy: "required" });
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectView("mfa_verify");
    await signin.page.getByRole("button", { name: "Email code" }).click();
    await signin.page.getByRole("button", { name: /Send it again/ }).click();
    await expect(signin.page.getByText("We sent a new code.")).toBeVisible();
    await signin.typeCode(TEST_CODE);
    await signin.expectSignedIn(email);
  });

  test("required, no factor, inside the grace period: signed in with a nudge", async ({ signin, settings }) => {
    await settings.update({ mfa_policy: "required", mfa_grace_period_days: 7 });
    const email = newEmail("mfa-grace");
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectView("mfa_enroll_suggest");
    await expect(signin.page.getByText(/will soon need a second step/)).toBeVisible();
    await signin.expectSignedIn(email);
    await signin.page.getByRole("button", { name: "Continue" }).click();
    await signin.expectView("authenticated");
    await signin.expectSignedIn(email);
  });

  test("required, no factor, past the grace period: refused with an explanation, no session", async ({
    signin,
    settings,
    server,
  }) => {
    const email = newEmail("mfa-nograce");
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectSignedIn(email);
    await signOut(signin);
    await server.endSessions(email);
    await server.backdate(email, 30);
    await settings.update({ mfa_policy: "required", mfa_grace_period_days: 7 });

    await signin.signInWithCode(email);
    await signin.expectView("mfa_enroll");
    await expect(signin.page.getByText("Set up two-step verification first")).toBeVisible();
    await signin.expectSignedOut();
    await expectNoSession(signin);
    expect((await server.userState(email)).sessions).toBe(0);
    await signin.page.getByRole("button", { name: "Back to sign in" }).click();
    await signin.expectView("login");
  });

  test("allowed methods: enrolling a method the app doesn't allow is refused", async ({ signin, settings }) => {
    await settings.update({ mfa_methods_allowed: ["totp"] });
    const email = newEmail("mfa-allowed");
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectSignedIn(email);
    const refused = await signin.client(
      (c, e) =>
        c.enrollMfa({ method: "email", secret_data: e }).then((r: any) => ({
          ok: !!r.data,
          code: r.error?.json?.error_code ?? r.error?.code ?? null,
          reason: r.error?.json?.error ?? null,
        })),
      email
    );
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe("method_not_allowed");
    expect(refused.reason).toBeTruthy();
  });

  // Decision needed: the API checks mfa_methods_allowed only when a factor is
  // set up, so a method switched off later is still challenged and offered.
  // Enforcing it at sign-in can lock out people whose only factor it is.
  test.fixme("allowed methods: a method switched off after enrollment is not offered at sign-in", async ({
    signin,
    settings,
  }) => {
    const email = newEmail("mfa-switched-off");
    const factors = await personWithFactors(signin, email, { emailFactor: true });
    await settings.update({ mfa_policy: "required", mfa_methods_allowed: ["totp", "backup_codes"] });
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectView("mfa_verify");
    await expect(signin.page.getByRole("button", { name: "Email code" })).toHaveCount(0);
    await signin.typeCode(await nextTotp(factors));
    await signin.expectSignedIn(email);
  });
});
