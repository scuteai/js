// DX-08 item 4: MFA with TOTP computed from the enrollment secret. Enroll
// and verify, a sign-in that then needs MFA (finished with TOTP), backup
// codes (one finishes a sign-in), and removing the method with the
// re-verify challenge.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { needsReverification } from "@scute/js-core";
import type { LiveContext } from "../lib/context";
import { describeError, done, noError, ok, sleep } from "../lib/check";
import { otpSignIn } from "../lib/flows";
import { freshTotp, selfTest } from "../lib/totp";

type AppJson = { mfa_policy?: string; mfa_reverify_minutes?: number; mfa_methods_allowed?: string[] };

export function mfaSuite(get: () => LiveContext) {
  describe("4. MFA", () => {
    let restore: Record<string, unknown> = {};
    let signedInAt = 0;

    beforeAll(async () => {
      const ctx = get();
      // No SDK method for app settings: GET/PATCH /v1/apps/:app_id.
      // MFA "optional": users who set up a method are asked for it at sign-in.
      const { data: app } = await ctx.api.get<AppJson>(ctx.api.appPath, { auth: "none" });
      restore = { mfa_policy: app.mfa_policy ?? "disabled", mfa_reverify_minutes: app.mfa_reverify_minutes ?? 10 };
      await ctx.api.patch(ctx.api.appPath, {
        mfa_policy: "optional",
        // The slow test waits out the shortest re-verify window the API allows.
        ...(ctx.env.slow ? { mfa_reverify_minutes: 5 } : {}),
      });
    });

    afterAll(async () => {
      const ctx = get();
      await ctx.api.patch(ctx.api.appPath, restore).catch((e) => console.warn(`[scute live] couldn't restore the MFA settings: ${describeError(e)}`));
    });

    it("signs in the MFA user by email OTP", async () => {
      const ctx = get();
      expect(selfTest(), "the suite's TOTP matches RFC 6238").toBe(true);
      const client = ctx.newClient();
      const email = ctx.email("mfa");
      const outcome = await otpSignIn(client, email, "sendLoginOtp");
      expect(outcome.kind).toBe("signed_in");
      signedInAt = Date.now();
      const { user } = ok(await client.getUser(), "getUser");
      ctx.trackUser(String(user!.id));
      ctx.state.mfa = { id: String(user!.id), identifier: email, client };
    });

    it("enrolls TOTP with a code computed from the enrollment secret (enrollMfa, verifyMfaEnrollment)", async ({ skip }) => {
      const mfa = get().state.mfa ?? skip("needs the MFA user's sign-in");
      const enrolled = ok(await mfa.client.enrollMfa({ method: "totp", name: "Live authenticator" }), "enrollMfa");
      expect(enrolled.enrollment.verified).toBe(false);
      expect(enrolled.provisioning_uri?.startsWith("otpauth://totp/")).toBe(true);
      const secret = enrolled.secret ?? "";
      expect(secret.length).toBeGreaterThan(15);

      const { code, step } = await freshTotp(secret);
      const verified = ok(await mfa.client.verifyMfaEnrollment(enrolled.enrollment.id, code), "verifyMfaEnrollment");
      expect(verified.enrollment.verified).toBe(true);
      Object.assign(mfa, { secret, enrollmentId: enrolled.enrollment.id, lastStep: step });
    });

    it("lists the method and reports MFA on (listMfaMethods, getMfaStatus)", async ({ skip }) => {
      const mfa = get().state.mfa ?? skip("needs the MFA user's sign-in");
      const enrollmentId = mfa.enrollmentId ?? skip("needs the TOTP enrollment");
      const methods = ok(await mfa.client.listMfaMethods(), "listMfaMethods");
      expect(methods.mfa_enabled).toBe(true);
      expect(methods.methods.find((m) => m.id === enrollmentId)).toMatchObject({ method: "totp", verified: true });
      expect(ok(await mfa.client.getMfaStatus(), "getMfaStatus").mfa_enabled).toBe(true);
      expect(ok(await get().newClient().getMfaStatus(mfa.identifier), "getMfaStatus(identifier), before sign-in").mfa_enabled).toBe(true);
    });

    it("generates backup codes (generateBackupCodes)", async ({ skip }) => {
      const mfa = get().state.mfa ?? skip("needs the MFA user's sign-in");
      if (!mfa.enrollmentId) return skip("needs the TOTP enrollment");
      const { backup_codes } = ok(await mfa.client.generateBackupCodes(), "generateBackupCodes");
      expect(backup_codes.length).toBe(10);
      mfa.backupCodes = backup_codes;
      expect(ok(await mfa.client.listMfaMethods(), "listMfaMethods").backup_codes_available).toBe(10);
    });

    it("a new sign-in now needs MFA, and a TOTP code finishes it, with no key (getChallengeStatus, verifyMfaChallenge; fixed F1)", async ({ skip }) => {
      const ctx = get();
      const mfa = ctx.state.mfa ?? skip("needs the MFA user's sign-in");
      const secret = mfa.secret ?? skip("needs the TOTP enrollment");
      const client = ctx.newClient();
      const outcome = await otpSignIn(client, mfa.identifier, "sendLoginOtp");
      if (outcome.kind !== "mfa") throw new Error("the sign-in went through without asking for MFA");
      expect(outcome.challengeMethod).toBe("totp");
      expect(outcome.availableMethods).toEqual(expect.arrayContaining(["totp", "backup_codes"]));
      const token = outcome.challengeToken ?? "";
      expect(token.length).toBeGreaterThan(0);

      // The browser has no API key: the sign-in's own MFA challenge answers without one.
      const status = ok(await client.getChallengeStatus(token), "getChallengeStatus");
      expect(status.challenge.status).toBe("pending");
      expect(status.challenge.method).toBe("totp");

      const { code, step } = await freshTotp(secret, mfa.lastStep);
      mfa.lastStep = step;
      const { error } = await client.verifyMfaChallenge(token, code);
      noError(error, "verifyMfaChallenge");
      mfa.completedChallenge = token;
      expect(String(ok(await client.getUser(), "getUser").user?.id)).toBe(mfa.id);
      mfa.latestClient = client;
    });

    it("a backup code finishes an MFA sign-in after switching method, with no key (switchMfaMethod, verifyMfaChallenge; fixed F1)", async ({ skip }) => {
      const ctx = get();
      const mfa = ctx.state.mfa ?? skip("needs the MFA user's sign-in");
      const codes = mfa.backupCodes ?? skip("needs the backup codes");
      const client = ctx.newClient();
      const outcome = await otpSignIn(client, mfa.identifier, "sendLoginOtp");
      if (outcome.kind !== "mfa") throw new Error("the sign-in went through without asking for MFA");

      const switched = ok(await client.switchMfaMethod(outcome.challengeToken ?? "", "backup_code"), "switchMfaMethod");
      expect(switched.method).toBe("backup_code");
      const { error } = await client.verifyMfaChallenge(switched.token, codes[0]);
      noError(error, "verifyMfaChallenge with a backup code");
      expect(String(ok(await client.getUser(), "getUser").user?.id)).toBe(mfa.id);
      expect(ok(await mfa.client.listMfaMethods(), "listMfaMethods").backup_codes_available, "a backup code works once").toBe(9);
      mfa.latestClient = client;
    });

    it("SCUTE_LIVE_SLOW=1: after the re-verify window, removing the method needs a verification (needsReverification)", async ({ skip }) => {
      const ctx = get();
      if (!ctx.env.slow) skip("waits over 5 minutes; set SCUTE_LIVE_SLOW=1 to run it");
      const mfa = ctx.state.mfa ?? skip("needs the MFA user's sign-in");
      const enrollmentId = mfa.enrollmentId ?? skip("needs the TOTP enrollment");

      // Wait until the MFA user's sign-in (at the start of this block) is past the 5 minute window.
      await sleep(Math.max(0, signedInAt + 5 * 60_000 + 20_000 - Date.now()));
      const refused = await mfa.client.removeMfaMethod(enrollmentId);
      expect(needsReverification(refused.error), `expected verification_required, got ${describeError(refused.error)}`).toBe(true);

      // The proof: the completed MFA challenge of the TOTP sign-in, or (when that test didn't get one) a
      // step-up challenge the backend starts (authzStartStepUp) and finishes with the person's TOTP code. No
      // SDK method finishes a challenge from the backend: POST /v1/auth/:app_id/challenges/:token/verify.
      let challenge = mfa.completedChallenge;
      if (!challenge) {
        const started = ok(
          await ctx.admin.authzStartStepUp({ userId: mfa.id, permission: ctx.perm("edit"), method: "totp" }),
          "authzStartStepUp"
        );
        const { code, step } = await freshTotp(mfa.secret ?? "", mfa.lastStep);
        mfa.lastStep = step;
        const { data } = await ctx.api.post(`${ctx.api.authPath}/challenges/${encodeURIComponent(started.challenge.token)}/verify`, { code });
        expect(data.status).toBe("completed");
        challenge = started.challenge.token;
      }
      done(await mfa.client.removeMfaMethod(enrollmentId, { challenge }), "removeMfaMethod with the challenge");
      mfa.enrollmentId = undefined;
    }, 8 * 60_000);

    it("removes the TOTP method (removeMfaMethod: a recent sign-in, plus the completed MFA challenge when there is one)", async ({ skip }) => {
      const mfa = get().state.mfa ?? skip("needs the MFA user's sign-in");
      const enrollmentId = mfa.enrollmentId ?? skip(get().env.slow ? "the slow test removed it" : "needs the TOTP enrollment");
      // Within the app's re-verify window a recent sign-in is enough; the challenge is the proof outside it.
      const options = mfa.completedChallenge ? { challenge: mfa.completedChallenge } : {};
      done(await mfa.client.removeMfaMethod(enrollmentId, options), "removeMfaMethod");
      mfa.enrollmentId = undefined;

      const methods = ok(await mfa.client.listMfaMethods(), "listMfaMethods");
      expect(methods.methods.some((m) => m.method === "totp" && m.verified)).toBe(false);
      expect(methods.mfa_enabled).toBe(false);
    });
  });
}
