// DX-08 item 2 (the rest): revoking sessions, from the user's side and the
// backend's, and signing out.

import { describe, expect, it } from "vitest";
import type { ScuteUserSession } from "@scute/js-core";
import type { LiveContext } from "../lib/context";
import { done, ok } from "../lib/check";
import { accessOf } from "../lib/flows";

const newest = (sessions: ScuteUserSession[]) =>
  [...sessions].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];

export function sessionsSuite(get: () => LiveContext) {
  describe("2b. sessions", () => {
    it("a user revokes their own session; its token stops working (revokeSession)", async ({ skip }) => {
      const ctx = get();
      const phone = ctx.state.phone ?? skip("needs the SMS sign-in");
      const access = await accessOf(phone.client);
      const sessions = ok(await phone.client.listUserSessions(), "listUserSessions");
      const target = newest(sessions);
      expect(target, "the SMS sign-in's session").toBeTruthy();

      done(await phone.client.revokeSession(target.id), "revokeSession");
      const after = await ctx.newClient().getUser(access);
      expect(Boolean(after.error), "the revoked session's token is refused").toBe(true);
    });

    it("the backend lists a user's sessions with the secret alone (ScuteAdminApi.listUserSessions; fixed F2)", async ({ skip }) => {
      const ctx = get();
      const mfa = ctx.state.mfa ?? skip("needs the MFA user's sign-in");
      const viaAdmin = ok(await ctx.admin.listUserSessions(mfa.id), "listUserSessions");
      const viaUser = ok(await mfa.client.listUserSessions(), "the user's own listUserSessions");
      expect(viaAdmin.map((s) => String(s.id)).sort()).toEqual(viaUser.map((s) => String(s.id)).sort());
      expect(viaAdmin.length).toBeGreaterThan(0);
    });

    it("the backend revokes a user's session with the secret alone; its token stops working (revokeUserSession; fixed F2)", async ({ skip }) => {
      const ctx = get();
      const mfa = ctx.state.mfa ?? skip("needs the MFA user's sign-in");
      // The newest session is the MFA user's latest sign-in (the MFA tests), or the first one.
      const owner = mfa.latestClient ?? mfa.client;
      const access = await accessOf(owner);
      const target = newest(ok(await ctx.admin.listUserSessions(mfa.id), "listUserSessions"));

      done(await ctx.admin.revokeUserSession(mfa.id, target.id), "revokeUserSession");
      const left = ok(await ctx.admin.listUserSessions(mfa.id), "listUserSessions");
      expect(left.some((s) => s.id === target.id), "the revoked session is gone").toBe(false);
      expect(Boolean((await ctx.newClient().getUser(access)).error), "its access token is refused").toBe(true);
    });
  });

  describe("2c. sign out", () => {
    it("signs out (signOut); the token is refused afterwards", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const access = await accessOf(main.client);
      expect(await main.client.signOut()).toBe(true);
      const { data } = await main.client.getSession();
      expect(data.session?.status).toBe("unauthenticated");
      const after = await ctx.newClient().getUser(access);
      expect(Boolean(after.error), "a signed-out token is refused").toBe(true);
    });
  });
}
