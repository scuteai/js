/**
 * ScuteSignIn and useScuteAuthFlow on the sign-in and MFA owner decisions:
 * setting up a second factor with the sign-in's setup pass (D17, D18),
 * confirming an email or phone first (D15), the waiting page while the
 * other device finishes (D2), a challenge link that signs nobody in (D16),
 * a sign-in method the app turned off (D13, D20) and an idle sign-out (D14).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScuteSignIn } from "../signin/ScuteSignIn";
import {
  AUTH_CHANGE_EVENTS,
  MAGIC_TOKEN,
  createFakeClient,
  flush,
  makeWrapper,
  setUrl,
  type FakeClient,
} from "./fakeScuteClient";

const SETUP = "scsetup_abc";

function renderSignIn(client: FakeClient) {
  const Wrapper = makeWrapper(client);
  return render(
    <Wrapper>
      <ScuteSignIn />
    </Wrapper>
  );
}

const boxes = (label: string) =>
  screen.getAllByRole("textbox").filter((el) => el.getAttribute("aria-label")?.startsWith(`${label}, character`)) as HTMLInputElement[];

const paste = async (label: string, code: string) => {
  await act(async () => {
    fireEvent.paste(boxes(label)[0], { clipboardData: { getData: () => code } });
  });
};

const apiError = (status: number, error_code: string, error = "nope", extra: Record<string, unknown> = {}) => ({
  code: status,
  message: "",
  json: { error, error_code, ...extra },
});

// A magic link landing whose answer is a step: the core emits the event and
// keeps the raw answer pending, as the real client does.
function landWithStep(client: FakeClient, event: string, pending: Record<string, unknown>, data: Record<string, unknown>) {
  setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
  client.verifyMagicLinkToken.mockImplementation(async () => {
    if (event === AUTH_CHANGE_EVENTS.CONTACT_VERIFICATION_REQUIRED) client.pendingContactVerification = pending;
    else client.pendingMfaChallenge = pending;
    client.emit(event);
    return { data, error: null };
  });
}

const setupStep = (methods = ["totp", "sms", "email"]) => ({
  pending: { mfa_required: true, mfa_enrollment_required: true, available_methods: methods, setup_token: SETUP },
  data: { mfaRequired: true, mfaEnrollmentRequired: true, availableMethods: methods, setupToken: SETUP, setupExpiresAt: null },
});

const CHALLENGE = { token: "cv_tok", status: "pending", purpose: "verify_contact", method: "email_otp", expires_at: "" };

function setupClient(overrides: Record<string, unknown> = {}) {
  return createFakeClient({
    enrollMfaWithSetupToken: vi.fn(async (_t: string, method: string) => ({
      data: {
        enrollment: { id: "enr_1", method, name: null, verified: false, is_default: false },
        ...(method === "totp" ? { provisioning_uri: "otpauth://totp/Acme:ada?secret=ABCD", secret: "ABCD" } : null),
      },
      error: null,
    })),
    verifyMfaEnrollmentWithSetupToken: vi.fn(),
    addSignInContact: vi.fn(),
    verifyContactVerification: vi.fn(),
    resendContactVerification: vi.fn(),
    pendingContactVerification: null,
    ...overrides,
  });
}

beforeEach(() => {
  setUrl("/");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setUrl("/");
});

describe("D18: setting up a second factor while signing in", () => {
  async function atSetup(client: FakeClient, methods?: string[]) {
    const { pending, data } = setupStep(methods);
    landWithStep(client, AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_REQUIRED, pending, data);
    renderSignIn(client);
    await screen.findByRole("heading", { name: "Set up two-step verification" });
  }

  it("offers the allowed methods, sets up an authenticator app and signs in with its code", async () => {
    const client = setupClient();
    client.verifyMfaEnrollmentWithSetupToken.mockImplementation(async () => {
      client.emitSignedIn();
      return { data: null, error: null };
    });
    await atSetup(client);
    expect(screen.queryByText(/Contact the app's support team/)).toBeNull();
    expect(screen.getByRole("button", { name: "Text message" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Email" })).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Authenticator app" })));
    expect(client.enrollMfaWithSetupToken).toHaveBeenCalledWith(SETUP, "totp", undefined);
    expect(screen.getByRole("link", { name: "Open in your authenticator app" }).getAttribute("href")).toBe(
      "otpauth://totp/Acme:ada?secret=ABCD"
    );
    expect(screen.getByText("ABCD")).toBeTruthy();

    await paste("Authenticator app", "123456");
    expect(client.verifyMfaEnrollmentWithSetupToken).toHaveBeenCalledWith(SETUP, "enr_1", "123456");
    await screen.findByRole("heading", { name: "You're in" });
  });

  it("stays on the code after a wrong one", async () => {
    const client = setupClient({
      verifyMfaEnrollmentWithSetupToken: vi.fn(async () => ({ data: null, error: apiError(422, "invalid_code", "Invalid verification code") })),
    });
    await atSetup(client);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Authenticator app" })));
    await paste("Authenticator app", "000000");
    await screen.findByText("That code didn't work. Try again.");
    expect(boxes("Authenticator app")).toHaveLength(6);
  });

  it("sends a text code to the number given, and Use another way goes back", async () => {
    const client = setupClient();
    await atSetup(client);
    fireEvent.click(screen.getByRole("button", { name: "Text message" }));
    const input = screen.getByLabelText("Phone number");
    fireEvent.change(input, { target: { value: "+1 201 555 0142" } });
    await act(async () => fireEvent.submit(input.closest("form")!));
    expect(client.enrollMfaWithSetupToken).toHaveBeenCalledWith(SETUP, "sms", "+1 201 555 0142");
    expect(screen.getByText("+1 201 555 0142")).toBeTruthy();
    expect(boxes("Text message code")).toHaveLength(6);

    fireEvent.click(screen.getByRole("button", { name: "Use another way" }));
    expect(screen.getByRole("button", { name: "Authenticator app" })).toBeTruthy();
  });

  it("says to sign in again when the setup pass expired", async () => {
    const client = setupClient({
      enrollMfaWithSetupToken: vi.fn(async () => ({ data: null, error: apiError(401, "setup_expired") })),
    });
    await atSetup(client);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Authenticator app" })));
    await screen.findByRole("heading", { name: "This sign-in timed out" });
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("keeps the support message without a setup pass (an older API)", async () => {
    const client = setupClient();
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    client.verifyMagicLinkToken.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_REQUIRED);
      return { data: { mfaRequired: true, mfaEnrollmentRequired: true, availableMethods: [] }, error: null };
    });
    renderSignIn(client);
    await screen.findByText(/Contact the app's support team to set one up/);
  });

  it("explains mfa_method_unavailable as an app setting for support", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = setupClient({
      verifyMagicLinkToken: vi.fn(async () => ({ data: null, error: apiError(403, "mfa_method_unavailable") })),
    });
    renderSignIn(client);
    await screen.findByRole("heading", { name: "You can't finish signing in here" });
    expect(screen.getByText(/Contact the app's support team/)).toBeTruthy();
  });
});

describe("D15: confirming an email or phone first", () => {
  it("asks for the code sent to the email on file and signs in with it", async () => {
    const client = setupClient();
    client.verifyContactVerification.mockImplementation(async () => {
      client.emitSignedIn();
      return { data: null, error: null };
    });
    landWithStep(
      client,
      AUTH_CHANGE_EVENTS.CONTACT_VERIFICATION_REQUIRED,
      { contact_verification_required: true, field: "email", challenge: CHALLENGE },
      { contactVerificationRequired: true, field: "email", challenge: CHALLENGE, setupToken: null }
    );
    renderSignIn(client);
    await screen.findByRole("heading", { name: "Confirm your email" });
    expect(screen.getByText("We sent a 6-digit code to the email on your account.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Change the email" })).toBeNull();

    await paste("Confirmation code", "123456");
    expect(client.verifyContactVerification).toHaveBeenCalledWith("123456", "cv_tok");
    await screen.findByRole("heading", { name: "You're in" });
  });

  it("stays on a wrong code, and resends", async () => {
    const client = setupClient({
      verifyContactVerification: vi.fn(async () => ({ data: null, error: apiError(422, "", "Incorrect code", { remaining_attempts: 2 }) })),
      resendContactVerification: vi.fn(async () => ({ data: { challenge: { ...CHALLENGE, token: "cv_2" } }, error: null })),
    });
    landWithStep(
      client,
      AUTH_CHANGE_EVENTS.CONTACT_VERIFICATION_REQUIRED,
      { contact_verification_required: true, field: "email", challenge: CHALLENGE },
      { contactVerificationRequired: true, field: "email", challenge: CHALLENGE, setupToken: null }
    );
    renderSignIn(client);
    await screen.findByRole("heading", { name: "Confirm your email" });
    await paste("Confirmation code", "000000");
    await screen.findByText("That code didn't work. Check it and try again.");

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send it again" })));
    expect(client.resendContactVerification).toHaveBeenCalledWith("cv_tok");
    expect(screen.getByText(/We sent a new code/)).toBeTruthy();
  });

  it("asks for a phone when there is none, sends the code to it, and the code can lead to MFA", async () => {
    const client = setupClient({
      addSignInContact: vi.fn(async () => ({ data: { field: "phone", challenge: { ...CHALLENGE, method: "sms_otp" } }, error: null })),
    });
    client.verifyContactVerification.mockImplementation(async () => {
      client.pendingMfaChallenge = { mfa_required: true, mfa_challenge: { token: "mfa_1", method: "totp" }, available_methods: ["totp"] };
      client.emit(AUTH_CHANGE_EVENTS.MFA_REQUIRED);
      return { data: { mfaRequired: true, mfaChallenge: { token: "mfa_1", method: "totp" }, availableMethods: ["totp"] }, error: null };
    });
    landWithStep(
      client,
      AUTH_CHANGE_EVENTS.CONTACT_VERIFICATION_REQUIRED,
      { contact_verification_required: true, field: "phone", setup_token: SETUP },
      { contactVerificationRequired: true, field: "phone", challenge: null, setupToken: SETUP }
    );
    renderSignIn(client);
    await screen.findByRole("heading", { name: "Add your phone number" });
    const input = screen.getByLabelText("Phone number");
    fireEvent.change(input, { target: { value: "+12015550142" } });
    await act(async () => fireEvent.submit(input.closest("form")!));
    expect(client.addSignInContact).toHaveBeenCalledWith("+12015550142", SETUP);
    await screen.findByRole("heading", { name: "Confirm your phone number" });
    expect(screen.getByText("+12015550142")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change the number" })).toBeTruthy();

    await paste("Confirmation code", "123456");
    await screen.findByRole("heading", { name: "One more step" });
  });

  it("shows contact_taken under the field", async () => {
    const client = setupClient({
      addSignInContact: vi.fn(async () => ({ data: null, error: apiError(409, "contact_taken", "That phone is already in use") })),
    });
    landWithStep(
      client,
      AUTH_CHANGE_EVENTS.CONTACT_VERIFICATION_REQUIRED,
      { contact_verification_required: true, field: "phone", setup_token: SETUP },
      { contactVerificationRequired: true, field: "phone", challenge: null, setupToken: SETUP }
    );
    renderSignIn(client);
    await screen.findByRole("heading", { name: "Add your phone number" });
    const input = screen.getByLabelText("Phone number");
    fireEvent.change(input, { target: { value: "+12015550142" } });
    await act(async () => fireEvent.submit(input.closest("form")!));
    expect(screen.getByRole("alert").textContent).toBe("That phone is already in use");
    expect(screen.getByRole("heading", { name: "Add your phone number" })).toBeTruthy();
  });
});

describe("D2: the page waiting for the link", () => {
  it("says to finish on the other device while it waits, then does its own setup step", async () => {
    vi.useFakeTimers();
    const client = setupClient();
    client.signInOrUp.mockImplementation(async () => {
      client.emit(AUTH_CHANGE_EVENTS.MAGIC_PENDING);
      return { data: { magic_link: { id: "ml_1" } }, error: null };
    });
    const { pending, data } = setupStep(["totp"]);
    client.getMagicLinkStatus
      .mockResolvedValueOnce({ data: null, error: apiError(409, "sign_in_pending") })
      .mockResolvedValueOnce({ data: pending, error: null });
    client.signInWithMagicLinkStatus.mockImplementation(async () => {
      client.pendingMfaChallenge = pending;
      client.emit(AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_REQUIRED);
      return { data, error: null };
    });
    renderSignIn(client);
    await flush();
    await act(async () => {
      const input = screen.getByLabelText("Email");
      fireEvent.change(input, { target: { value: "ada@example.com" } });
      fireEvent.submit(input.closest("form")!);
    });
    expect(screen.getByRole("heading", { name: "Check your inbox" })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByRole("heading", { name: "Finish on the other device" })).toBeTruthy();
    expect(screen.getByText(/Finish signing in on the device where you opened the link/)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByRole("heading", { name: "Set up two-step verification" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Authenticator app" })).toBeTruthy();
  });
});

describe("D16: a challenge link that signs nobody in", () => {
  it("says Verified instead of signing in", async () => {
    setUrl(`/cb?sct_magic=${MAGIC_TOKEN}`);
    const client = setupClient({
      verifyMagicLinkToken: vi.fn(async () => ({
        data: { challengeCompleted: true, signedIn: false, challenge: null, intent: "approve_payout", intentFields: null },
        error: null,
      })),
    });
    renderSignIn(client);
    await screen.findByRole("heading", { name: "Verified" });
    expect(screen.getByText("You can close this page and go back to where you were.")).toBeTruthy();
    expect(client.signInWithTokenPayload).not.toHaveBeenCalled();
  });
});

describe("D13, D20: the ways the app signs in", () => {
  it("explains a method the app turned off and reloads the app's settings", async () => {
    const client = setupClient({
      signInOrUp: vi.fn(async () => ({
        data: null,
        error: apiError(403, "sign_in_method_disabled", "Signing in with phone is turned off for this app", { details: { method: "phone" } }),
      })),
    });
    renderSignIn(client);
    await screen.findByRole("heading", { name: "Sign in" });
    const input = screen.getByLabelText("Email");
    fireEvent.change(input, { target: { value: "+12015550142" } });
    await act(async () => fireEvent.submit(input.closest("form")!));
    expect(screen.getByRole("alert").textContent).toBe(
      "Signing in with a phone number is turned off for this app. Use your email instead."
    );
    expect(client.getAppData).toHaveBeenCalledWith(true);
  });

  it("says a link or a code, as the app sends", async () => {
    const client = setupClient();
    client.appData = { email_auth_type: "otp" };
    renderSignIn(client);
    await screen.findByText("Enter your email and we will send you a sign-in code. No account yet? This makes one.");
  });
});

describe("D14: signed out after being inactive", () => {
  it("says so on the email step", async () => {
    const client = setupClient();
    renderSignIn(client);
    await screen.findByRole("heading", { name: "Sign in" });
    act(() => client.emitSignedIn());
    await screen.findByRole("heading", { name: "You're in" });

    client.sessionEndReason = "session_idle";
    act(() => client.emit(AUTH_CHANGE_EVENTS.SESSION_EXPIRED));
    await screen.findByRole("heading", { name: "Sign in" });
    expect(screen.getByRole("alert").textContent).toBe("You were signed out after being inactive. Sign in again.");
  });
});
