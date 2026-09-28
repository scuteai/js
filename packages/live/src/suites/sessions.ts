// DX-08 item 2 (the rest): revoking sessions, from the user's side and the
// backend's, and signing out.

import { describe, expect, it } from "vitest";
import type { ScuteUserSession } from "@scute/js-core";
import type { LiveContext } from "../lib/context";
import { describeError, done, ok } from "../lib/check";
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
      expect(after.error, "the revoked session's token is refused").toBeTruthy();
    });

    it("the backend lists a user's sessions (ScuteAdminApi.listUserSessions)", async ({ skip }) => {
      const ctx = get();
      const mfa = ctx.state.mfa ?? skip("needs the MFA user's sign-in");
      const result = await ctx.admin.listUserSessions(mfa.id);
      expect(result.error, `listUserSessions: ${describeError(result.error)}`).toBeNull();
      expect((result.data ?? []).length).toBeGreaterThan(0);
    });

    it("the backend revokes a user's session (ScuteAdminApi.revokeUserSession); its token stops working", async ({ skip }) => {
      const ctx = get();
      const mfa = ctx.state.mfa ?? skip("needs the MFA user's sign-in");
      const access = await accessOf(mfa.client);
      const mine = ok(await mfa.client.listUserSessions(), "listUserSessions");
      const target = newest(mine);

      const result = await ctx.admin.revokeUserSession(mfa.id, target.id);
      expect(result.error, `revokeUserSession: ${describeError(result.error)}`).toBeNull();
      const left = await mfa.client.listUserSessions();
      const stillThere = !left.error && (left.data ?? []).some((s) => s.id === target.id);
      expect(stillThere, "the revoked session is gone").toBe(false);
      if (left.error) {
        // It was this client's own session: its token is refused now.
        expect((await ctx.newClient().getUser(access)).error).toBeTruthy();
      }
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
      expect(after.error, "a signed-out token is refused").toBeTruthy();
    });
  });
}
