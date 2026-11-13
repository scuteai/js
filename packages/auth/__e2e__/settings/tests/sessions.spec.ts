// Session lifetimes, refresh, sign-out, and sessions that end on the server
// while the page still holds them.
import { expect, holdMagicLinks, newEmail, test, type SignInPage } from "../lib/fixtures";

async function signedIn(signin: SignInPage, email: string) {
  await signin.open();
  await signin.signInWithCode(email);
  await signin.expectView("authenticated");
  await signin.expectSignedIn(email);
}

test.describe("Sessions", () => {
  test("a short access token is refreshed and the page stays signed in @webkit", async ({ signin, settings }) => {
    await settings.update({ access_expiration: 20 });
    const email = newEmail("sess-refresh");
    await signedIn(signin, email);
    // The page refreshes on its own (ScuteSession's auto-refresh ticks every
    // 30 s and refreshes a token that runs out within three ticks), not only
    // when asked for the session below.
    const refreshes: string[] = [];
    signin.page.on("request", (r) => {
      if (r.method() === "POST" && r.url().endsWith("/tokens/refresh")) refreshes.push(r.url());
    });
    await expect.poll(() => refreshes.length, { timeout: 40_000, message: "no refresh while the page sat open" }).toBeGreaterThan(0);
    const user = await signin.client((c) => c.getSession().then((r: any) => r.data?.session?.status));
    expect(user).toBe("authenticated");
    await signin.page.reload();
    await signin.expectView("authenticated");
    await signin.expectSignedIn(email);
  });

  test("sign-out ends the session on the server too", async ({ signin, server }) => {
    const email = newEmail("sess-out");
    await signedIn(signin, email);
    const before = (await server.userState(email)).sessions;
    expect(before).toBeGreaterThan(0);
    await signin.page.getByTestId("sign-out").click();
    await signin.expectView("login");
    await signin.expectSignedOut();
    await expect.poll(async () => (await server.userState(email)).sessions).toBe(before - 1);
    await signin.page.reload();
    await signin.expectView("login");
    await signin.expectSignedOut();
  });

  test("a session ended on the server: the next load shows the sign-in, not a spinner @webkit", async ({
    signin,
    server,
  }) => {
    const email = newEmail("sess-dead");
    await signedIn(signin, email);
    await server.endSessions(email);
    await signin.page.reload();
    await signin.expectView("login");
    await signin.expectSignedOut();
    await signin.expectNoSpinnerAfter(3_000);
  });

  test("a session ended on the server, then a sign-in link: signs in, no stuck 'Signing you in' @webkit", async ({
    signin,
    server,
    settings,
  }) => {
    const email = newEmail("sess-dead-link");
    await signedIn(signin, email);
    await server.endSessions(email);
    await settings.update({ email_auth_type: "magic" });
    const link = await server.mintMagicLink(email);
    await signin.page.goto(signin.url({ sct_magic: link.token }));
    await signin.expectView("authenticated");
    await signin.expectSignedIn(email);
  });

  test("an expired refresh token: the next load shows the sign-in", async ({ signin, settings }) => {
    await settings.update({ access_expiration: 15, refresh_expiration: 20 });
    const email = newEmail("sess-expired");
    await signedIn(signin, email);
    await signin.page.waitForTimeout(25_000);
    await signin.page.reload();
    await signin.expectView("login");
    await signin.expectSignedOut();
    await signin.expectNoSpinnerAfter(2_000);
  });

  test("refresh_payload off: signs in; when the access token runs out the page signs out cleanly", async ({
    signin,
    settings,
  }) => {
    await settings.update({ refresh_payload: false, access_expiration: 20 });
    const email = newEmail("sess-norefresh");
    await signedIn(signin, email);
    await signin.page.reload();
    await signin.expectSignedIn(email);
    await signin.page.waitForTimeout(25_000);
    await signin.page.reload();
    await signin.expectView("login");
    await signin.expectSignedOut();
  });

  test("banned while signed in: signed out at the next refresh, without a refresh loop", async ({
    signin,
    settings,
    server,
  }) => {
    await settings.update({ access_expiration: 15 });
    const email = newEmail("sess-banned");
    await signedIn(signin, email);
    await server.flag(email, "banned");
    await signin.page.waitForTimeout(20_000);
    await signin.page.reload();
    await signin.expectView("login");
    await signin.expectSignedOut();
    await signin.expectNoSpinnerAfter(5_000);
  });

  // D13 (API): a sign-in method the app turned off is refused even from a
  // page that loaded before the change (403 sign_in_method_disabled).
  test("settings changed while the page is open: the old method is refused, then the page follows the new one", async ({
    signin,
    settings,
    server,
  }) => {
    const email = newEmail("sess-flip");
    await signin.open();
    await expect(signin.page.getByText("we will send you a sign-in code")).toBeVisible();
    await settings.update({ email_auth_type: "magic" });
    const sent = await holdMagicLinks(signin.page, server);

    // The page still asks for a code (it read the settings when it loaded):
    // refused with a reason, nothing pending.
    await signin.submitEmail(email);
    await expect(signin.page.locator("#scute-signin-email-error")).toContainText("Sign-in codes by email are turned off");
    await signin.expectView("login");
    await signin.expectSignedOut();
    expect(sent).toHaveLength(0);

    // Then it follows the new setting: a sign-in link.
    await expect(signin.page.getByText("we will send you a sign-in link")).toBeVisible();
    await signin.submitEmail(email);
    await signin.expectView("magic_pending");
    expect(sent).toHaveLength(1);
  });
});
