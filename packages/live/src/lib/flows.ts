// Sign-in steps the tests share, written the way an app uses the SDK.

import type { ScuteClient, ScuteTokenPayload } from "@scute/js-core";
import { describeError, ok } from "./check";
import { TEST_CODE } from "./context";

export type OtpOutcome =
  | { kind: "signed_in"; payload: ScuteTokenPayload }
  | {
      kind: "mfa";
      challengeToken?: string;
      challengeMethod?: string;
      availableMethods: string[];
      enrollmentRequired: boolean;
    };

/**
 * Send a code (signIn, which picks OTP for this app, or sendLoginOtp),
 * verify 424242, and finish with signInWithTokenPayload, like auth-ui does.
 */
export async function otpSignIn(client: ScuteClient, identifier: string, via: "signIn" | "sendLoginOtp"): Promise<OtpOutcome> {
  // signIn reads the app's email_auth_type; make sure it's loaded first
  // (signIn itself doesn't wait for it).
  ok(await client.getAppData(), "getAppData");

  const sent = via === "signIn" ? await client.signIn(identifier) : await client.sendLoginOtp(identifier);
  if (sent.error) throw new Error(`${via} failed: ${describeError(sent.error)}`);

  const verified = ok(await client.verifyOtp(TEST_CODE, identifier), "verifyOtp");
  if (verified.mfaRequired) {
    return {
      kind: "mfa",
      challengeToken: verified.mfaChallenge?.token,
      challengeMethod: verified.mfaChallenge?.method,
      availableMethods: verified.availableMethods ?? [],
      enrollmentRequired: verified.mfaEnrollmentRequired === true,
    };
  }
  const payload = verified.authPayload;
  if (!payload) throw new Error("verifyOtp answered neither tokens nor an MFA challenge");

  const { error } = await client.signInWithTokenPayload(payload);
  if (error) throw new Error(`signInWithTokenPayload failed: ${describeError(error)}`);
  return { kind: "signed_in", payload };
}

/** The signed-in client's current access token (never printed). */
export async function accessOf(client: ScuteClient): Promise<string> {
  const { data, error } = await client.getAuthToken();
  if (error || !data?.access) throw new Error(`no access token: ${describeError(error)}`);
  return data.access;
}
