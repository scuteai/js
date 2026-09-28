// DX-08 item 5: managing users from the backend (ScuteAdminApi).

import { describe, expect, it } from "vitest";
import type { LiveContext } from "../lib/context";
import { PHASE } from "../lib/context";
import { done, errorCodeOf, failed, noError, ok, statusOf } from "../lib/check";
import { FINDINGS, knownBug } from "../lib/findings";

type ManagedUser = { id: string | number; email: string | null; status: string; authz_attributes?: Record<string, unknown> };

export function usersSuite(get: () => LiveContext) {
  describe("5. admin users", () => {
    let deleted: { id: string; email: string } | undefined;
    it("creates a user (createUser)", async () => {
      const ctx = get();
      const email = ctx.email(2);
      const { user } = ok(await ctx.admin.createUser(email), "createUser");
      expect(user.email).toBe(email);
      expect(user.status).toBe("active");
      ctx.trackUser(String(user.id));
      ctx.state.second = { id: String(user.id), email };
    });

    it("gets a user by id (getUser)", async ({ skip }) => {
      const ctx = get();
      const second = ctx.state.second ?? skip("needs the created user");
      const { user } = ok(await ctx.admin.getUser(second.id), "getUser");
      expect(user?.email).toBe(second.email);
    });

    it("gets a user by identifier (getUserByIdentifier) and finds them in the list (listUsers)", async ({ skip }) => {
      const ctx = get();
      const second = ctx.state.second ?? skip("needs the created user");
      const { user } = ok(await ctx.admin.getUserByIdentifier(second.email), "getUserByIdentifier");
      expect(String(user?.id)).toBe(second.id);

      const listed = ok(await ctx.admin.listUsers({ email: second.email }), "listUsers");
      expect(listed.users.map((u) => String(u.id))).toContain(second.id);
    });

    it("updates a user's authorization attributes (updateUser)", async ({ skip }) => {
      const ctx = get();
      const second = ctx.state.second ?? skip("needs the created user");
      ok(await ctx.admin.updateUser(second.id, { authz_attributes: { region: "us", team: ctx.prefix } }), "updateUser");
      const { user } = ok(await ctx.admin.getUser(second.id), "getUser");
      const attrs = (user as unknown as ManagedUser).authz_attributes ?? {};
      expect(attrs.region).toBe("us");
      expect(attrs.team).toBe(ctx.prefix);
    });

    it("deactivates and activates a user (deactivateUser, activateUser)", async ({ skip }) => {
      const ctx = get();
      const second = ctx.state.second ?? skip("needs the created user");
      ok(await ctx.admin.deactivateUser(second.id), "deactivateUser");
      expect(ok(await ctx.admin.getUser(second.id), "getUser").user?.status).toBe("inactive");
      ok(await ctx.admin.activateUser(second.id), "activateUser");
      expect(ok(await ctx.admin.getUser(second.id), "getUser").user?.status).toBe("active");
    });

    it("deletes a user (deleteUser); getUser then answers 404", async () => {
      const ctx = get();
      const email = ctx.email("deleted");
      const { user } = ok(await ctx.admin.createUser(email), "createUser");
      const id = String(user.id);
      ctx.trackUser(id);
      done(await ctx.admin.deleteUser(id), "deleteUser");
      expect(failed(await ctx.admin.getUser(id), "getUser of a deleted user").status).toBe(404);
      deleted = { id, email };
    });

    it("the identifier lookup answers only what sign-in needs (getUserByIdentifier; fixed F6)", async ({ skip }) => {
      const ctx = get();
      const second = ctx.state.second ?? skip("needs the created user");
      const { user } = ok(await ctx.admin.getUserByIdentifier(second.email), "getUserByIdentifier");
      expect(String(user?.id)).toBe(second.id);
      expect(Object.keys(user ?? {}).sort()).toEqual(["email", "id", "status", "webauthn_enabled"]);
      // The same without any credentials, as a browser asks.
      const { data } = await ctx.api.get(`${ctx.api.authPath}/users`, { auth: "none", query: { identifier: second.email } });
      expect(Object.keys(data.user ?? {}).sort()).toEqual(["email", "id", "status", "webauthn_enabled"]);
    });

    it("with public sign-up on, looking up an unknown identifier makes the user (what released SDKs' signIn needs)", async () => {
      const ctx = get();
      const email = ctx.email("lookup");
      const { user } = ok(await ctx.admin.getUserByIdentifier(email), "getUserByIdentifier");
      if (user) ctx.trackUser(String(user.id));
      const listed = ok(await ctx.admin.listUsers({ email }), "listUsers");
      for (const u of listed.users) ctx.trackUser(String(u.id));
      expect(user?.email).toBe(email);
      expect(listed.users.map((u) => String(u.id))).toEqual([String(user?.id)]);
    });

    it("with public sign-up off, an unknown identifier answers null and makes nobody (fixed F6)", async () => {
      const ctx = get();
      // No SDK method for app settings: GET/PATCH /v1/apps/:app_id.
      const { data: app } = await ctx.api.get<{ public_signup?: boolean }>(ctx.api.appPath, { auth: "none" });
      const was = app.public_signup !== false;
      ctx.cleanup.add(PHASE.settings, "restore public sign-up", () => ctx.api.patch(ctx.api.appPath, { public_signup: was }));
      const email = ctx.email("closed");
      try {
        await ctx.api.patch(ctx.api.appPath, { public_signup: false });
        const { user } = ok(await ctx.admin.getUserByIdentifier(email), "getUserByIdentifier");
        expect(user ?? null).toBeNull();
        const listed = ok(await ctx.admin.listUsers({ email }), "listUsers");
        for (const u of listed.users) ctx.trackUser(String(u.id));
        expect(listed.users.length, "nobody was made").toBe(0);
      } finally {
        // Back right away: the sign-ins after this make new users.
        await ctx.api.patch(ctx.api.appPath, { public_signup: was });
      }
    });

    it("a deleted user stays deleted when looked up by identifier (fixed F6)", async ({ skip }) => {
      const ctx = get();
      const gone = deleted ?? skip("needs the deleted user");
      const { user } = ok(await ctx.admin.getUserByIdentifier(gone.email), "getUserByIdentifier");
      expect(user ?? null, "a deleted user's identifier answers null").toBeNull();
      expect(failed(await ctx.admin.getUser(gone.id), "getUser of the deleted user").status).toBe(404);
    });

    it("a deleted user stays deleted when they sign in again (known bug F8: the OTP send brings them back)", async ({ skip, annotate }) => {
      const ctx = get();
      const gone = deleted ?? skip("needs the deleted user");
      const sent = await ctx.newClient().sendLoginOtp(gone.email);
      const after = await ctx.admin.getUser(gone.id);
      // F8: POST /v1/auth/:app_id/otps/login find-or-creates, and a unique index sends it back to the deleted row,
      // which it undeletes. (Cleanup deletes the user again.)
      await knownBug(
        annotate,
        FINDINGS.otpSignInUndeletes,
        !after.error,
        `POST /otps/login answered ${sent.error ? statusOf(sent.error) : 200}, then GET /v1/:app_id/users/:id answered 200 (it was 404)`
      );
    });

    it("gets a user's basic info by user id (getUserByUserId; known bug F10: 400)", async ({ skip, annotate }) => {
      const ctx = get();
      const second = ctx.state.second ?? skip("needs the created user");
      const result = await ctx.admin.getUserByUserId(second.id);
      const code = statusOf(result.error);
      if (code !== 400) noError(result.error, "getUserByUserId");
      await knownBug(annotate, FINDINGS.getUserByUserIdBroken, code === 400, `GET /v1/auth/:app_id/users?user_id= answered ${code} ${errorCodeOf(result.error) ?? ""}`.trim());
    });
  });
}
