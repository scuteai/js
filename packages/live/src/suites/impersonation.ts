// DX-08 item 6: signing in as a user (support access). The backend starts
// and ends sessions as the user (ScuteAdminApi); the browser switches to one
// and back (ScuteClient.beginImpersonation / stopImpersonating).

import { beforeAll, describe, expect, it } from "vitest";
import { decodeImpersonation, impersonationContext, type ScuteImpersonationTokens } from "@scute/js-core";
import type { LiveContext } from "../lib/context";
import { claimsOf, describeError, done, failed, noError, ok } from "../lib/check";

export function impersonationSuite(get: () => LiveContext) {
  describe("6. impersonation", () => {
    let tokens: ScuteImpersonationTokens | undefined;
    const supportEmail = () => get().email("support");

    beforeAll(async () => {
      const ctx = get();
      // No SDK method for authz settings: PATCH /v1/apps/:app_id/authz/settings.
      await ctx.api.patch(`${ctx.api.appPath}/authz/settings`, { impersonation: true, impersonation_max_minutes: 60 });
    });

    it("starts a session as the user from the backend; the act claim names who is acting (impersonateUser)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      tokens = ok(
        await ctx.admin.impersonateUser(main.id, {
          reason: `${ctx.prefix}: live test`,
          minutes: 5,
          actor: { email: supportEmail(), name: "Live Support" },
        }),
        "impersonateUser"
      );
      expect(typeof tokens.access).toBe("string");
      expect(Boolean(tokens.refresh), "a session as the user comes without a refresh token").toBe(false);
      expect(String(tokens.user_id)).toBe(main.id);

      const who = decodeImpersonation(tokens.access);
      expect(who?.actor.kind).toBe("backend");
      expect(who?.actor.email).toBe(supportEmail());
      const claims = claimsOf(tokens.access);
      expect(claims.imp).toBe(true);
      expect(claims.uuid).toBe(main.id);
      expect(claims.act?.email).toBe(supportEmail());
    });

    it("lists the sessions as the user (listImpersonations)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const started = tokens ?? skip("needs the session as the user");
      const list = ok(await ctx.admin.listImpersonations(main.id), "listImpersonations");
      const mine = list.find((s) => String(s.session_id) === String(started.session_id));
      expect(mine, "the session just started").toBeTruthy();
      expect(mine?.reason).toBe(`${ctx.prefix}: live test`);
      expect(mine?.actor.email).toBe(supportEmail());
    });

    it("the browser switches to it and back; inside, a 'not while impersonating' permission is denied", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const started = tokens ?? skip("needs the session as the user");

      // The support person's own browser session: the phone user's, when that sign-in worked.
      const browser = ctx.newClient();
      const own = ctx.state.phone;
      if (own?.payload) {
        const { error } = await browser.signInWithTokenPayload(own.payload);
        if (error) throw new Error(`signInWithTokenPayload failed: ${describeError(error)}`);
      }

      const begun = await browser.beginImpersonation(started);
      noError(begun.error, "beginImpersonation");
      const who = await browser.getImpersonation();
      expect(who?.actor.email).toBe(supportEmail());
      expect(String(ok(await browser.getUser(), "getUser").user?.id)).toBe(main.id);

      const share = ok(await browser.authz.can("share", `${ctx.resource}:1`), "authz.can share");
      expect(share.decision).toBe("deny");
      expect(share.reason).toBe("impersonating");
      const read = ok(await browser.authz.can("read", `${ctx.resource}:1`), "authz.can read");
      expect(read.decision).toBe("allow");

      const mfa = failed(await browser.enrollMfa({ method: "totp" }), "enrollMfa while impersonating");
      expect(mfa.status).toBe(403);
      expect(mfa.code).toBe("impersonating");

      expect(await browser.stopImpersonating()).toBe(true);
      expect(await browser.getImpersonation()).toBeNull();
      if (own?.payload) {
        expect(String(ok(await browser.getUser(), "getUser after stopping").user?.id), "the support person's own session is back").toBe(own.id);
      }

      const list = ok(await ctx.admin.listImpersonations(main.id), "listImpersonations");
      expect(list.map((s) => String(s.session_id))).not.toContain(String(started.session_id));
      const gone = await ctx.newClient().getUser(started.access);
      expect(Boolean(gone.error), "the ended session's token is refused").toBe(true);
    });

    it("the backend refuses a 'not while impersonating' permission with impersonationContext(claims)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const started = tokens ?? skip("needs the session as the user");
      const context = impersonationContext(claimsOf(started.access));
      expect(context.impersonated).toBe(true);

      const inside = ok(await ctx.admin.authzCheck({ userId: main.id, action: "share", resource: ctx.resource, context }), "authzCheck");
      expect(inside.decision).toBe("deny");
      expect(inside.reason).toBe("impersonating");
      const outside = ok(await ctx.admin.authzCheck({ userId: main.id, action: "share", resource: ctx.resource }), "authzCheck");
      expect(outside.decision).toBe("allow");
    });

    it("the backend ends a session as the user (stopImpersonating); its token stops working", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const second = ok(
        await ctx.admin.impersonateUser(main.id, { reason: `${ctx.prefix}: second look`, minutes: 5, actor: { name: "Live Support" } }),
        "impersonateUser"
      );
      expect(ok(await ctx.newClient().getUser(second.access), "getUser as the user").user).toBeTruthy();

      done(await ctx.admin.stopImpersonating(main.id, second.session_id), "stopImpersonating");
      const list = ok(await ctx.admin.listImpersonations(main.id), "listImpersonations");
      expect(list.map((s) => String(s.session_id))).not.toContain(String(second.session_id));
      const refused = await ctx.newClient().getUser(second.access);
      expect(Boolean(refused.error), "the ended session's token is refused").toBe(true);
    });
  });
}
