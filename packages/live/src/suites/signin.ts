// DX-08 items 2 and 3: sign-in with test identities (email and SMS OTP),
// the user, refresh, sessions, and checking an access token.

import { describe, expect, it } from "vitest";
import { InvalidAuthTokenError } from "@scute/js-core";
import type { LiveContext } from "../lib/context";
import { describeError, ok, tamper } from "../lib/check";
import { accessOf, otpSignIn } from "../lib/flows";

export function signInSuite(get: () => LiveContext) {
  describe("2. sign-in", () => {
    it("signs in by email OTP with a test identity (signIn picks OTP, verifyOtp 424242, signInWithTokenPayload)", async () => {
      const ctx = get();
      const client = ctx.newClient();
      const email = ctx.email("main");

      const outcome = await otpSignIn(client, email, "signIn");
      expect(outcome.kind, "a fresh user needs no MFA").toBe("signed_in");

      const { data: session } = await client.getSession();
      expect(session.session?.status).toBe("authenticated");

      const user = ok(await client.getUser(), "getUser").user;
      expect(user?.email).toBe(email);
      ctx.trackUser(String(user!.id));
      ctx.state.main = { id: String(user!.id), identifier: email, client, payload: outcome.kind === "signed_in" ? outcome.payload : undefined };
    });

    it("gets the signed-in user (getUser) and remembers who signed in", async ({ skip }) => {
      const main = get().state.main ?? skip("needs the email sign-in");
      const { user } = ok(await main.client.getUser(), "getUser");
      expect(String(user?.id)).toBe(main.id);
      expect(user?.status).toBe("active");
      expect(await main.client.getRememberedIdentifier()).toBe(main.identifier);
    });

    it("refreshes the session: a new access token that works (refreshSession)", async ({ skip }) => {
      const main = get().state.main ?? skip("needs the email sign-in");
      const before = await accessOf(main.client);
      ok(await main.client.refreshSession(), "refreshSession");
      const after = await accessOf(main.client);
      expect(after !== before, "refresh should hand out a new access token").toBe(true);
      const { user } = ok(await main.client.getUser(after), "getUser with the new token");
      expect(String(user?.id)).toBe(main.id);
    });

    it("lists the user's sessions (listUserSessions)", async ({ skip }) => {
      const main = get().state.main ?? skip("needs the email sign-in");
      const sessions = ok(await main.client.listUserSessions(), "listUserSessions");
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.some((s) => String(s.type) === "otp"), `session types: ${sessions.map((s) => s.type).join(", ")}`).toBe(true);
    });

    it("signs in by SMS OTP with a test phone number (sendLoginOtp, verifyOtp 424242)", async () => {
      const ctx = get();
      const client = ctx.newClient();
      const outcome = await otpSignIn(client, ctx.phone, "sendLoginOtp");
      expect(outcome.kind, "the phone user needs no MFA").toBe("signed_in");

      const user = ok(await client.getUser(), "getUser").user;
      expect((user?.phone ?? "").replace(/\D/g, "")).toBe(ctx.phone.replace(/\D/g, ""));
      ctx.trackUser(String(user!.id));
      ctx.state.phone = {
        id: String(user!.id),
        identifier: ctx.phone,
        client,
        payload: outcome.kind === "signed_in" ? outcome.payload : undefined,
      };
    });
  });

  describe("3. tokens", () => {
    it("the remote check accepts the access token and refuses a tampered one (getUser)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const access = await accessOf(main.client);
      const fresh = ctx.newClient();

      const good = await fresh.getUser(access);
      expect(good.error, describeError(good.error)).toBeNull();
      expect(String(good.data.user?.id)).toBe(main.id);

      const bad = await fresh.getUser(tamper(access));
      expect(bad.data.user).toBeNull();
      expect(bad.error instanceof InvalidAuthTokenError, `got ${describeError(bad.error)}`).toBe(true);
    });

    it.skip(
      "verifies a session access token locally against the app's JWKS, refusing tampered and expired ones: " +
        "the JS SDKs have no API for session tokens (verifySnapshotToken covers snapshots, and @scute/mcp-gateway " +
        "verifyAccessToken covers OAuth access tokens; both are tested below)",
      () => {}
    );
  });
}
