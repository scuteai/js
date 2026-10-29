// Passkeys (passkeys_enabled, webauthn_skip_mfa) with Chromium's virtual
// authenticator.
import type { CDPSession, Page } from "@playwright/test";
import { enrollTotp, expect, expectNoSession, newEmail, nextTotp, test, type Factors, type SignInPage } from "../lib/fixtures";

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

async function signOut(signin: SignInPage) {
  await signin.page.getByTestId("sign-out").click();
  await signin.expectView("login");
  await signin.expectSignedOut();
}

/** Signs up with a code and adds a passkey from the offer. */
async function personWithPasskey(signin: SignInPage, email: string) {
  await signin.open();
  await signin.signInWithCode(email);
  await signin.expectView("webauthn_register");
  await signin.expectSignedIn(email);
  await signin.page.getByRole("button", { name: "Add a passkey" }).click();
  await signin.expectView("authenticated");
  await signin.expectSignedIn(email);
}

test.describe("Passkeys", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "virtual authenticator is Chromium only");

  test("on: offered after the first sign-in, then used instead of a code", async ({ signin, settings }) => {
    await virtualAuthenticator(signin.page);
    await settings.update({ passkeys_enabled: true });
    const email = newEmail("pk");
    await personWithPasskey(signin, email);
    await signOut(signin);

    const before = (await signin.events()).length;
    await signin.submitEmail(email);
    await signin.expectView("authenticated");
    await signin.expectSignedIn(email);
    const events = (await signin.events()).slice(before);
    expect(events).toContain("webauthn_verify_success");
    expect(events).not.toContain("otp_pending");
  });

  test("on: skipping the offer still signs in", async ({ signin, settings }) => {
    await virtualAuthenticator(signin.page);
    await settings.update({ passkeys_enabled: true });
    const email = newEmail("pk-skip");
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectView("webauthn_register");
    await signin.page.getByRole("button", { name: "Skip for now" }).click();
    await signin.expectView("authenticated");
    await signin.expectSignedIn(email);
  });

  test("off: no offer, and someone with a passkey gets a code (after reload)", async ({ signin, settings }) => {
    await virtualAuthenticator(signin.page);
    await settings.update({ passkeys_enabled: true });
    const email = newEmail("pk-off");
    await personWithPasskey(signin, email);
    await signOut(signin);

    await settings.update({ passkeys_enabled: false });
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectView("authenticated");
    await signin.expectSignedIn(email);
  });

  test("MFA required with webauthn_skip_mfa on: a passkey is enough", async ({ signin, settings }) => {
    await virtualAuthenticator(signin.page);
    await settings.update({ passkeys_enabled: true });
    const email = newEmail("pk-mfa-skip");
    await personWithPasskey(signin, email);
    const factors: Factors = {};
    await enrollTotp(signin, factors);
    await signOut(signin);

    await settings.update({ mfa_policy: "required", webauthn_skip_mfa: true });
    await signin.open();
    await signin.submitEmail(email);
    await signin.expectView("authenticated");
    await signin.expectSignedIn(email);
  });

  test("MFA required with webauthn_skip_mfa off: a passkey sign-in still asks for the code", async ({
    signin,
    settings,
  }) => {
    await virtualAuthenticator(signin.page);
    await settings.update({ passkeys_enabled: true });
    const email = newEmail("pk-mfa");
    await personWithPasskey(signin, email);
    const factors: Factors = {};
    await enrollTotp(signin, factors);
    await signOut(signin);

    await settings.update({ mfa_policy: "required", webauthn_skip_mfa: false });
    await signin.open();
    await signin.submitEmail(email);
    await signin.expectView("mfa_verify");
    await signin.expectSignedOut();
    await expectNoSession(signin);
    await signin.typeCode(await nextTotp(factors));
    await signin.expectSignedIn(email);
  });

  test("a cancelled passkey prompt falls back to a code", async ({ signin, settings }) => {
    const cdp = await virtualAuthenticator(signin.page);
    await settings.update({ passkeys_enabled: true });
    const email = newEmail("pk-cancel");
    await personWithPasskey(signin, email);
    await signOut(signin);

    // A browser without that passkey (another device): the prompt fails.
    await cdp.send("WebAuthn.disable");
    await virtualAuthenticator(signin.page);
    await signin.submitEmail(email);
    await signin.expectView("otp_input", 60_000);
    await signin.typeCode("424242");
    await signin.expectSignedIn(email);
  });
});
