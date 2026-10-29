// The device fingerprint the SDK sends (X-Fingerprint), and trusting a device
// after a second factor.
import {
  enrollTotp,
  expect,
  newEmail,
  nextTotp,
  recordApiRequests,
  test,
  type Factors,
  type SignInPage,
} from "../lib/fixtures";

async function accessToken(signin: SignInPage): Promise<string> {
  return signin.client((c) => c.getAuthToken().then((r: any) => r.data?.access));
}

test.describe("Devices", () => {
  test("a code sign-in sends the device fingerprint and the session keeps it @webkit", async ({
    signin,
    server,
    setup,
  }) => {
    const email = newEmail("fp-code");
    const requests = recordApiRequests(signin.page, setup.apiUrl);
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectSignedIn(email);
    const verify = requests.find((r) => r.url().endsWith("/otps/verify"))!;
    expect(await verify.headerValue("x-fingerprint")).toBeTruthy();
    expect((await server.sessions(email))[0].fingerprint).toBe(true);
  });

  test("opening a sign-in link sends the device fingerprint with the link check @webkit", async ({
    signin,
    server,
    settings,
    setup,
  }) => {
    await settings.update({ email_auth_type: "magic" });
    const email = newEmail("fp-link");
    const link = await server.mintMagicLink(email);
    const requests = recordApiRequests(signin.page, setup.apiUrl);
    await signin.page.goto(signin.url({ sct_magic: link.token }));
    await signin.expectSignedIn(email);
    const check = requests.find((r) => r.url().endsWith("/magic_links/authenticate"))!;
    expect(await check.headerValue("x-fingerprint")).toBeTruthy();
    expect((await server.sessions(email))[0].fingerprint).toBe(true);
  });

  test("fingerprinting off in the SDK: no fingerprint is sent", async ({ signin, setup }) => {
    const email = newEmail("fp-off");
    const requests = recordApiRequests(signin.page, setup.apiUrl);
    await signin.open({ fp: "0" });
    await signin.signInWithCode(email);
    await signin.expectSignedIn(email);
    for (const r of requests) expect(await r.headerValue("x-fingerprint")).toBeNull();
  });

  test("trust this device: only after a second factor, and only when the app allows it", async ({
    signin,
    settings,
    server,
  }) => {
    const email = newEmail("trust");
    const factors: Factors = {};
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectSignedIn(email);
    // A code alone is one factor.
    let answer = await settings.call("POST", `/v1/auth/${settings.setup.appId}/trusted_devices`, {}, {
      "x-authorization": await accessToken(signin),
    });
    expect(answer.status).toBe(403);
    expect(answer.json.error_code).toBe("second_factor_required");

    await enrollTotp(signin, factors);
    await signin.page.getByTestId("sign-out").click();
    await signin.expectView("login");
    await settings.update({ mfa_policy: "required" });
    await signin.open();
    await signin.signInWithCode(email);
    await signin.expectView("mfa_verify");
    await signin.typeCode(await nextTotp(factors));
    await signin.expectSignedIn(email);

    await server.set({ device_trust_enabled: false });
    answer = await settings.call("POST", `/v1/auth/${settings.setup.appId}/trusted_devices`, {}, {
      "x-authorization": await accessToken(signin),
    });
    expect(answer.status).toBe(403);
    expect(answer.json.error_code).toBe("device_trust_off");

    await server.set({ device_trust_enabled: true });
    answer = await settings.call("POST", `/v1/auth/${settings.setup.appId}/trusted_devices`, {}, {
      "x-authorization": await accessToken(signin),
    });
    expect(answer.status).toBe(201);
    expect((await server.userState(email)).trusted_devices).toBe(1);
  });
});
