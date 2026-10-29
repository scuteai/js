// Sign-in links (email_auth_type "magic"): the waiting page, the landing page,
// and MFA on both. Links are made on the server and opened by the test; none
// is emailed.
import type { Browser } from "@playwright/test";
import {
  enrollTotp,
  expect,
  expectNoSession,
  holdMagicLinks,
  newEmail,
  nextTotp,
  SignInPage,
  test,
  type Factors,
  type Setup,
} from "../lib/fixtures";

/** Another device: a new browser context opening the link. */
async function openLinkElsewhere(browser: Browser, setup: Setup, token: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const other = new SignInPage(page, setup);
  await page.goto(other.url({ sct_magic: token }));
  return other;
}

test.describe("Sign-in links", () => {
  test("the waiting page signs in once the link is opened on another device @webkit", async ({
    signin,
    settings,
    server,
    setup,
    browser,
  }) => {
    await settings.update({ email_auth_type: "magic" });
    const email = newEmail("ml");
    const sent = await holdMagicLinks(signin.page, server);
    await signin.open();
    await signin.submitEmail(email);
    await signin.expectView("magic_pending");
    await expect(signin.page.getByText("Check your inbox")).toBeVisible();

    const other = await openLinkElsewhere(browser, setup, sent[0].token);
    await other.expectView("authenticated");
    await other.expectSignedIn(email);
    expect(other.page.url()).not.toContain("sct_magic");

    await signin.expectView("authenticated");
    await signin.expectSignedIn(email);
    await other.page.context().close();
  });

  test("a used link shows that it expired, with a way back", async ({ signin, settings, server, setup, browser }) => {
    await settings.update({ email_auth_type: "magic" });
    const email = newEmail("ml-used");
    const link = await server.mintMagicLink(email);
    const first = await openLinkElsewhere(browser, setup, link.token);
    await first.expectSignedIn(email);
    await first.page.context().close();

    await signin.page.goto(signin.url({ sct_magic: link.token }));
    await signin.expectView("error");
    await expect(signin.page.getByText("This link has expired")).toBeVisible();
    await signin.expectSignedOut();
    await signin.page.getByRole("button", { name: "Back to sign in" }).click();
    await signin.expectView("login");
  });

  test("MFA required: the link asks for the code on the device that opened it", async ({
    signin,
    settings,
    server,
    setup,
    browser,
  }) => {
    const email = newEmail("ml-mfa");
    const factors: Factors = {};
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectSignedIn(email);
    await enrollTotp(signin, factors);
    await signin.page.getByTestId("sign-out").click();
    await signin.expectSignedOut();
    await settings.update({ email_auth_type: "magic", mfa_policy: "required" });

    const link = await server.mintMagicLink(email);
    const other = await openLinkElsewhere(browser, setup, link.token);
    await other.expectView("mfa_verify");
    await expectNoSession(other);
    await other.typeCode(await nextTotp(factors));
    await other.expectSignedIn(email);
    await other.page.context().close();
  });

  test("MFA required: the waiting page does not sign in when the link is opened elsewhere", async ({
    signin,
    settings,
    server,
    setup,
    browser,
  }) => {
    const email = newEmail("ml-xlogin-mfa");
    const factors: Factors = {};
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectSignedIn(email);
    await enrollTotp(signin, factors);
    await signin.page.getByTestId("sign-out").click();
    await signin.expectSignedOut();
    await settings.update({ email_auth_type: "magic", mfa_policy: "required" });

    const sent = await holdMagicLinks(signin.page, server);
    await signin.open();
    await signin.submitEmail(email);
    await signin.expectView("magic_pending");

    // The link is opened on another device, which stops at the MFA step.
    const other = await openLinkElsewhere(browser, setup, sent[0].token);
    await other.expectView("mfa_verify");

    // The waiting page must not get a session that skipped MFA: it says to
    // finish on the other device and stops waiting.
    await signin.expectView("error");
    await expect(signin.page.getByText("Finish on the other device")).toBeVisible();
    await signin.expectNoSpinnerAfter(4_000);
    await signin.expectSignedOut();
    await expectNoSession(signin);
    expect((await server.sessions(email)).filter((s) => s.type === "xlogin")).toEqual([]);
    await other.page.context().close();
  });

  test("a waiting page that polls after the link's window closed stops waiting with a message", async ({
    signin,
    settings,
    server,
    setup,
    browser,
  }) => {
    await settings.update({ email_auth_type: "magic" });
    const email = newEmail("ml-late");
    const sent = await holdMagicLinks(signin.page, server);
    await signin.open();
    // Hold the polls while the link is opened and its window passes.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await signin.page.route(/\/magic_links\/status$/, async (route) => {
      await held;
      await route.continue();
    });
    await signin.submitEmail(email);
    await signin.expectView("magic_pending");
    const other = await openLinkElsewhere(browser, setup, sent[0].token);
    await other.expectSignedIn(email);
    await other.page.context().close();
    expect(await server.ageMagicLinkClaim(sent[0].id)).toBe(true);
    release();

    await expect(signin.view()).not.toHaveAttribute("data-scute-view", "magic_pending", { timeout: 20_000 });
    await signin.expectNoSpinnerAfter(1_000);
  });
});
