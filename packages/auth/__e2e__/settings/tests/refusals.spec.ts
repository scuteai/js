// Every way the API refuses a sign-in, and what ScuteSignIn says for it: a
// message a person can act on, the sign-in form back, no spinner left.
import { expect, newEmail, test, type SignInPage } from "../lib/fixtures";

async function signedUp(signin: SignInPage, email: string) {
  await signin.open();
  await signin.signInWithCode(email);
  await signin.expectSignedIn(email);
  await signin.page.getByTestId("sign-out").click();
  await signin.expectView("login");
}

/** The email step shows `text` under the field and nothing is pending. */
async function expectRefusedAtEmail(signin: SignInPage, text: string | RegExp) {
  await expect(signin.page.locator("#scute-signin-email-error")).toContainText(text);
  await signin.expectView("login");
  await signin.expectSignedOut();
  await expect(signin.page.getByRole("button", { name: "Continue" })).toBeEnabled();
  await signin.expectNoSpinnerAfter(500);
}

test.describe("Refusals", () => {
  test("public sign-up off: a new address is told it can't sign up @webkit", async ({ signin, settings }) => {
    await settings.update({ public_signup: false });
    await signin.open();
    await signin.submitEmail(newEmail("nosignup"));
    await expectRefusedAtEmail(signin, /sign.?up/i);
  });

  test("public sign-up off: an existing account still signs in", async ({ signin, settings }) => {
    const email = newEmail("nosignup-existing");
    await signedUp(signin, email);
    await settings.update({ public_signup: false });
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectSignedIn(email);
  });

  test("workspace asks for a name at sign-up: a bare address is told why", async ({ signin, server }) => {
    await server.setWorkspace({ user_info_requirement: "name_and_identifier" });
    await signin.open();
    await signin.submitEmail(newEmail("needs-name"));
    await expect(signin.page.locator("#scute-signin-email-error")).toBeVisible();
    const text = await signin.page.locator("#scute-signin-email-error").innerText();
    expect(text).not.toMatch(/Something went wrong on our side/);
    await signin.expectView("login");
  });

  test("banned: refused with the ban message @webkit", async ({ signin, server }) => {
    const email = newEmail("banned");
    await signedUp(signin, email);
    await server.flag(email, "banned");
    await signin.open();
    await signin.submitEmail(email);
    await expectRefusedAtEmail(signin, "banned from this app");
  });

  test("suspended: refused with the suspension message", async ({ signin, server }) => {
    const email = newEmail("suspended");
    await signedUp(signin, email);
    await server.flag(email, "suspended");
    await signin.open();
    await signin.submitEmail(email);
    await expectRefusedAtEmail(signin, "suspended");
  });

  test("banned after the code was sent: the code step says so", async ({ signin, server }) => {
    const email = newEmail("banned-late");
    await signedUp(signin, email);
    await signin.submitEmail(email);
    await signin.expectView("otp_input");
    await server.flag(email, "banned");
    await signin.typeCode("424242");
    await expect(signin.page.locator("#scute-signin-code-error")).toContainText("banned");
    await signin.expectSignedOut();
  });

  test("deactivated: refused, not signed in, no spinner", async ({ signin, server, settings }) => {
    const email = newEmail("deactivated");
    await signedUp(signin, email);
    const { id } = await server.userState(email);
    await settings.deactivate(id);
    await signin.open();
    await signin.submitEmail(email);
    await expect(async () => {
      const view = await signin.view().getAttribute("data-scute-view");
      expect(["login", "otp_input", "error"]).toContain(view);
    }).toPass();
    if ((await signin.view().getAttribute("data-scute-view")) === "otp_input") await signin.typeCode("424242");
    await signin.page.waitForTimeout(3_000);
    await signin.expectSignedOut();
    await expect(signin.page.locator("[data-scute-error], [role=alert]").first()).toBeVisible();
    await signin.expectNoSpinnerAfter(500);
  });

  test("every address blocked by the workspace's IP rules: refused with the network message", async ({
    signin,
    server,
  }) => {
    const email = newEmail("ip-blocked");
    await signedUp(signin, email);
    await server.blockAllAddresses(true);
    await signin.open();
    await signin.submitEmail(email);
    await expectRefusedAtEmail(signin, "network");
  });

  test("too many codes for one address: a clear message, the form back", async ({ signin }) => {
    const email = newEmail("ratelimit");
    await signedUp(signin, email);
    // The API allows 5 sends a minute per address; spend them.
    await signin.client(async (c, e) => {
      for (let i = 0; i < 5; i++) await c.sendLoginOtp(e, undefined, false);
    }, email);
    await signin.submitEmail(email);
    await expect(signin.page.locator("#scute-signin-email-error")).toBeVisible();
    const text = await signin.page.locator("#scute-signin-email-error").innerText();
    expect(text).toMatch(/too many|try again/i);
    expect(text).not.toMatch(/Something went wrong on our side/);
    await signin.expectView("login");
  });

  test("attack protection asks a new device to confirm a sign-in link with a code @webkit", async ({
    signin,
    server,
    settings,
  }) => {
    const email = newEmail("verify-new-device");
    await signedUp(signin, email);
    await settings.update({ email_auth_type: "magic" });
    await server.set({ security_level: "medium", require_verification_new_device: true });
    const link = await server.mintMagicLink(email);
    // A device this person never signed in from (its own fingerprint).
    const context = await signin.page.context().browser()!.newContext();
    const page = await context.newPage();
    const device = `e2e-device-${Date.now()}`;
    await page.route(`${signin.setup.apiUrl}/**`, (route) =>
      route.continue({ headers: { ...route.request().headers(), "x-fingerprint": device } })
    );
    const { SignInPage } = await import("../lib/fixtures");
    const other = new SignInPage(page, signin.setup);
    await page.goto(other.url({ sct_magic: link.token }));
    await other.expectView("verification_required");
    await expect(page.getByText("Confirm it's you")).toBeVisible();
    await other.expectSignedOut();
    await other.typeCode("000000");
    await expect(page.locator("#scute-signin-verification-error")).toBeVisible();
    await other.typeCode("424242");
    await other.expectView("authenticated");
    await other.expectSignedIn(email);
    await context.close();
  });
});
