// What the app takes to sign in (identifier_email, identifier_phone): the
// sign-in field follows it. Phone numbers are test identities
// (+1 201 555 01xx): the code is 424242 and no text is sent.
import { expect, test } from "../lib/fixtures";

const testPhone = () => `+1 201 555 01${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`;

test.describe("Identifiers", () => {
  test("email only: an email field @webkit", async ({ signin }) => {
    await signin.open();
    const field = signin.page.getByLabel("Email", { exact: true });
    await expect(field).toHaveAttribute("type", "email");
  });

  test("phone only: a phone field, and a text code signs in @webkit", async ({ signin, settings }) => {
    await settings.update({ identifier_phone: true, identifier_email: false });
    await signin.open();
    const field = signin.page.getByLabel("Phone number");
    await expect(field).toHaveAttribute("type", "tel");
    await signin.pace();
    await field.fill(testPhone());
    await signin.page.getByRole("button", { name: "Continue" }).click();
    await signin.expectView("otp_input");
    await signin.typeCode("424242");
    await signin.expectView("authenticated");
    await signin.expectSignedIn();
  });

  test("email and phone: one field for either", async ({ signin, settings }) => {
    await settings.update({ identifier_phone: true, identifier_email: true });
    await signin.open();
    await expect(signin.page.getByLabel("Email or phone number")).toHaveAttribute("type", "text");
  });
});
