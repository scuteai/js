// DX-08 item 2 (the rest): revoking sessions, from the user's side and the
// backend's, and signing out.

import { describe, expect, it } from "vitest";
import type { ScuteUserSession } from "@scute/js-core";
import type { LiveContext } from "../lib/context";
import { done, noError, ok, statusOf } from "../lib/check";
import { FINDINGS, knownBug } from "../lib/findings";
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

    it("the backend lists a user's sessions (ScuteAdminApi.listUserSessions; known bug F2: 401)", async ({ skip, annotate }) => {
      const ctx = get();
      const mfa = ctx.state.mfa ?? skip("needs the MFA user's sign-in");
      const result = await ctx.admin.listUserSessions(mfa.id);
      // F2: GET /v1/:app_id/users/:id/sessions wants a user session token next to the secret.
      const code = statusOf(result.error);
      if (code !== 401) noError(result.error, "listUserSessions");
      await knownBug(annotate, FINDINGS.adminSessionsNeedUserToken, code === 401, `GET /v1/:app_id/users/:id/sessions answered ${code}`);
      // Once F2 is fixed: noError(result.error, "listUserSessions") and at least one session.
    });

    it("the backend revokes a user's session (ScuteAdminApi.revokeUserSession; known bug F2: 401)", async ({ skip, annotate }) => {
      const ctx = get();
      const mfa = ctx.state.mfa ?? skip("needs the MFA user's sign-in");
      const mine = ok(await mfa.client.listUserSessions(), "listUserSessions");
      const target = newest(mine);

      const result = await ctx.admin.revokeUserSession(mfa.id, target.id);
      // F2: DELETE /v1/:app_id/users/:id/sessions/:session_id wants a user session token next to the secret.
      const code = statusOf(result.error);
      if (code !== 401) noError(result.error, "revokeUserSession");
      await knownBug(annotate, FINDINGS.adminSessionsNeedUserToken, code === 401, `DELETE /v1/:app_id/users/:id/sessions/:id answered ${code}`);
      // Once F2 is fixed: noError(result.error, "revokeUserSession"), the session is gone from the list, and if it was
      // this client's own, its access token is refused.
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
