// What makes MFA a real second factor, not just a second screen: wrong codes
// run out, a TOTP code works once, SMS codes reach the enrolled phone, an
// admin can reset a locked-out person, and changing MFA needs a recent
// verification. Driven through the public API (as an attacker would) and the
// SDK on the test page.
import {
  enrollTotp,
  expect,
  expectNoSession,
  newEmail,
  nextTotp,
  test,
  TEST_CODE,
  type Factors,
  type SignInPage,
  type Setup,
} from "../lib/fixtures";

/** A test-identity phone (US 555-01xx): always gets 424242, nothing is texted. */
const testPhone = () => `+1201555${String(100 + Math.floor(Math.random() * 100)).padStart(4, "0")}`;

/** The public sign-in API, called the way the SDK calls it (no key, the app's origin). */
async function api(setup: Setup, method: string, path: string, body?: unknown) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${setup.apiUrl}/v1/auth/${setup.appId}${path}`, {
      method,
      headers: { "content-type": "application/json", origin: "http://localhost:4317" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    // The shared per-IP limit (other traffic on this network): wait it out.
    if (res.status === 429 && json?.rule === "api/ip" && attempt < 2) {
      await new Promise((r) => setTimeout(r, (Number(json.retry_after) || 30) * 1000 + 500));
      continue;
    }
    return { status: res.status, json };
  }
}

/** Email + code over the API, up to the MFA step: the mfa_required answer. */
async function firstFactor(setup: Setup, email: string) {
  const start = await api(setup, "POST", "/otps/login", { identifier: email });
  expect(start.status, JSON.stringify(start.json)).toBe(200);
  const verified = await api(setup, "POST", "/otps/verify", { otp: TEST_CODE, user_id: start.json.user_id });
  expect(verified.status, JSON.stringify(verified.json)).toBe(200);
  expect(verified.json.mfa_required, "the first factor alone must not give a session").toBe(true);
  expect(verified.json.access).toBeUndefined();
  return verified.json as { app_user_id: string; mfa_challenge: { token: string; method: string; remaining_attempts: number } };
}

async function signOut(signin: SignInPage) {
  await signin.page.getByTestId("sign-out").click();
  await signin.expectView("login");
}

/** A person with TOTP set up, signed out, on an app that requires MFA. */
async function personWithTotp(signin: SignInPage, settings: { update: (a: Record<string, unknown>) => Promise<unknown> }, tag: string) {
  const email = newEmail(tag);
  const factors: Factors = {};
  await signin.open();
  await signin.signInWithCode(email);
  await signin.expectSignedIn(email);
  await enrollTotp(signin, factors);
  await signOut(signin);
  await settings.update({ mfa_policy: "required" });
  return { email, factors };
}

test.describe("MFA security", () => {
  test("wrong codes run out: 3 per challenge, then even the right code is refused", async ({ signin, settings, setup }) => {
    const { email, factors } = await personWithTotp(signin, settings, "sec-brute");
    const { mfa_challenge: challenge } = await firstFactor(setup, email);
    expect(challenge.method).toBe("totp");
    expect(challenge.remaining_attempts).toBe(3);

    for (const left of [2, 1, 0]) {
      const wrong = await api(setup, "POST", `/challenges/${challenge.token}/verify`, { code: "000000" });
      expect(wrong.status).toBe(422);
      expect(wrong.json.remaining_attempts).toBe(left);
    }
    const right = await api(setup, "POST", `/challenges/${challenge.token}/verify`, { code: await nextTotp(factors) });
    expect(right.status, "the right code after 3 wrong ones").toBe(422);
    expect(right.json.access).toBeUndefined();
  });

  test("new challenges per sign-in are capped, so guesses are bounded until the first factor is redone", async ({
    signin,
    settings,
    setup,
  }) => {
    const { email } = await personWithTotp(signin, settings, "sec-cap");
    const first = await firstFactor(setup, email);
    let current = first.mfa_challenge.token;
    let refusedAt = 0;
    for (let i = 1; i <= 8; i++) {
      // As the SDK switches: cancel the current challenge, then ask for a new one.
      await api(setup, "DELETE", `/challenges/${current}`);
      const made = await api(setup, "POST", "/challenges", { purpose: "mfa", method: "totp", app_user_id: first.app_user_id });
      if (made.status >= 400) {
        // Past the cap the keyless path no longer applies, so the API asks
        // for the app's key (401).
        expect([401, 403, 422, 429]).toContain(made.status);
        refusedAt = i;
        break;
      }
      current = made.json.challenge.token;
    }
    // The first factor made challenge 1; switches 2..6 are allowed, the 7th is not.
    expect(refusedAt, "switches allowed before the cap").toBeGreaterThan(1);
    expect(refusedAt, "at most 6 challenges (about 18 guesses) per sign-in").toBeLessThanOrEqual(6);
  });

  test("a TOTP code works once: replaying it in the same 30 s is refused", async ({ signin, settings, setup }) => {
    const { email, factors } = await personWithTotp(signin, settings, "sec-replay");
    const code = await nextTotp(factors);

    const first = await firstFactor(setup, email);
    const ok = await api(setup, "POST", `/challenges/${first.mfa_challenge.token}/verify`, { code });
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    expect(ok.json.access).toBeTruthy();

    const again = await firstFactor(setup, email);
    const replay = await api(setup, "POST", `/challenges/${again.mfa_challenge.token}/verify`, { code });
    expect(replay.status, "the same code a second time").toBe(422);
    expect(replay.json.access).toBeUndefined();
  });

  test("SMS as the second step: set up with a phone, then the sign-in texts that phone @webkit", async ({ signin, settings, server }) => {
    await settings.update({ mfa_methods_allowed: ["sms", "backup_codes"] });
    const email = newEmail("sec-sms");
    const phone = testPhone();
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectSignedIn(email);

    // The person's profile has no phone: the code must go to the enrolled one.
    const started = await signin.client(
      (c, p) => c.enrollMfa({ method: "sms", secret_data: p }).then((r: any) => ({ data: r.data, error: r.error?.message ?? null })),
      phone
    );
    expect(started.error).toBeNull();
    const wrong = await signin.client((c, id) => c.verifyMfaEnrollment(id, "000000").then((r: any) => !!r.error), started.data.enrollment.id);
    expect(wrong, "a wrong enrollment code").toBe(true);
    const enrolled = await signin.client(
      (c, a) => c.verifyMfaEnrollment(a.id, a.code).then((r: any) => r.error?.message ?? null),
      { id: started.data.enrollment.id, code: TEST_CODE }
    );
    expect(enrolled).toBeNull();
    expect((await server.userState(email)).mfa).toContain("sms");
    await signOut(signin);

    await settings.update({ mfa_policy: "required" });
    await signin.signInWithCode(email);
    await signin.expectView("mfa_verify");
    await expect(signin.page.getByText("Enter the 6-digit code we just texted you.")).toBeVisible();
    await expectNoSession(signin);
    await signin.typeCode("000000");
    await expect(signin.page.locator("#scute-signin-mfa-error")).toBeVisible();
    await signin.typeCode(TEST_CODE);
    await signin.expectSignedIn(email);
  });

  test("locked out: the app's admin resets MFA with the secret key, and the person can sign in and set it up again", async ({
    signin,
    settings,
    server,
  }) => {
    const { email } = await personWithTotp(signin, settings, "sec-reset");
    const { id } = await server.userState(email);
    const reset = await settings.call("DELETE", `/v1/${settings.setup.appId}/users/${id}/mfa`);
    expect(reset.status, JSON.stringify(reset.json)).toBeLessThan(300);
    expect((await server.userState(email)).mfa).toEqual([]);

    // Still required, inside the grace period: in, with the nudge to set it up.
    await signin.signInWithCode(email);
    await signin.expectView("mfa_enroll_suggest");
    await signin.expectSignedIn(email);

    // Without the secret key the same call is refused.
    const anonymous = await fetch(`${settings.setup.apiUrl}/v1/${settings.setup.appId}/users/${id}/mfa`, { method: "DELETE" });
    expect(anonymous.status).toBeGreaterThanOrEqual(400);
  });

  test("changing MFA needs a recent verification: an old session can't remove a factor", async ({ signin, settings, server }) => {
    await settings.update({ mfa_reverify_minutes: 5 });
    const email = newEmail("sec-reverify");
    const factors: Factors = {};
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectSignedIn(email);
    await enrollTotp(signin, factors);
    const methodId = await signin.client((c) =>
      c.listMfaMethods().then((r: any) => (r.data?.methods ?? r.data?.mfa_methods ?? r.data ?? []).find((m: any) => m.method === "totp")?.id)
    );
    expect(methodId).toBeTruthy();

    await server.op("age_sessions", settings.setup.appId, email, 30);
    const refused = await signin.client(
      (c, id) => c.removeMfaMethod(id).then((r: any) => ({ ok: !r.error, code: r.error?.json?.error_code ?? r.error?.code ?? null })),
      methodId
    );
    expect(refused.ok, "removing a factor from a 30-minute-old session").toBe(false);
    expect(refused.code).toBe("verification_required");
    expect((await server.userState(email)).mfa).toContain("totp");

    await server.op("age_sessions", settings.setup.appId, email, 1);
    const allowed = await signin.client((c, id) => c.removeMfaMethod(id).then((r: any) => r.error?.message ?? null), methodId);
    expect(allowed, "removing it right after signing in").toBeNull();
    expect((await server.userState(email)).mfa).not.toContain("totp");
  });
});
