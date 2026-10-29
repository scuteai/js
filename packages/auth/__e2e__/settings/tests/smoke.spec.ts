import { expect, newEmail, test } from "../lib/fixtures";

test("email code sign-in, sign-out @webkit", async ({ signin, server }) => {
  const email = newEmail("smoke");
  await signin.open();
  await signin.expectView("login");
  await signin.signInWithCode(email);
  await signin.expectView("authenticated");
  await signin.expectSignedIn(email);
  const state = await server.userState(email);
  expect(state.sessions).toBeGreaterThan(0);
  await signin.page.getByTestId("sign-out").click();
  await signin.expectView("login");
  await signin.expectSignedOut();
});
