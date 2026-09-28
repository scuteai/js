// DX-08 items 2 and 3: sign-in with test identities (email and SMS OTP),
// the user, refresh, sessions, and checking an access token.

import { describe, expect, it } from "vitest";
import { IdentifierAlreadyExistsError, InvalidAuthTokenError } from "@scute/js-core";
import type { LiveContext } from "../lib/context";
import { claimsOf, describeError, noError, ok, tamper } from "../lib/check";
import { FINDINGS, knownBug } from "../lib/findings";
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
      expect(claimsOf(after).aid, "the refreshed token names the public app id (F7)").toBe(get().env.appId);
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

  describe("2a. sign-in edge cases", () => {
    it("getMfaStatus by phone number, before sign-in (fixed F5: it answered 500)", async ({ skip }) => {
      const ctx = get();
      if (!ctx.state.phone) skip("needs the SMS sign-in (the phone user)");
      const status = ok(await ctx.newClient().getMfaStatus(ctx.phone), "getMfaStatus(phone)");
      expect(status.mfa_enabled, "the phone user has no MFA").toBe(false);
    });

    it("signIn right after the client is made, before its app config arrives (fixed F4: it threw a TypeError)", async () => {
      const ctx = get();
      const email = ctx.email("early");
      const real = globalThis.fetch;
      // The app config request (GET /v1/apps/:app_id) answers 1.5s late, like a slow or cold request would.
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (new URL(url).pathname === `/v1/apps/${ctx.env.appId}`) await new Promise((r) => setTimeout(r, 1500));
        return real(input, init);
      }) as typeof fetch;
      let result: Awaited<ReturnType<ReturnType<LiveContext["newClient"]>["signIn"]>>;
      try {
        result = await ctx.newClient().signIn(email);
      } finally {
        globalThis.fetch = real;
      }
      // Public sign-up is on, so the identifier lookup made the user; delete it at the end.
      const listed = ok(await ctx.admin.listUsers({ email }), "listUsers");
      for (const u of listed.users) ctx.trackUser(String(u.id));

      noError(result.error, "signIn");
      expect(Boolean(result.data && "otp" in result.data && result.data.otp?.id), "signIn waited for the config and sent a code").toBe(true);
    });

    it("signUp refuses an identifier that already has an account (known bug F9: it sends a code instead)", async ({ skip, annotate }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in (a verified account)");
      const result = await ctx.newClient().signUp(main.identifier);
      if (result.error && !(result.error instanceof IdentifierAlreadyExistsError)) noError(result.error, "signUp");
      // F9: signUp decides with email_verified / phone_verified from the identifier lookup, which answers only
      // id, status, webauthn_enabled and the identifier now, so it never sees an existing account.
      await knownBug(annotate, FINDINGS.signUpCantSeeAccounts, !result.error, "signUp of a verified account answered no error and sent a registration code");
    });
  });

  describe("3. tokens", () => {
    it("the remote check accepts the access token and refuses a tampered one (getUser)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const access = await accessOf(main.client);
      const fresh = ctx.newClient();

      const good = await fresh.getUser(access);
      noError(good.error, "getUser with the access token");
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
