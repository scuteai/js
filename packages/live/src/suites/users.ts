// DX-08 item 5: managing users from the backend (ScuteAdminApi).

import { describe, expect, it } from "vitest";
import type { LiveContext } from "../lib/context";
import { done, failed, ok, statusOf } from "../lib/check";
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

    it("getUserByIdentifier only looks an identifier up (known bug F6: it makes the user)", async ({ annotate }) => {
      const ctx = get();
      const email = ctx.email("lookup");
      const { user } = ok(await ctx.admin.getUserByIdentifier(email), "getUserByIdentifier");
      if (user) ctx.trackUser(String(user.id));
      const listed = ok(await ctx.admin.listUsers({ email }), "listUsers");
      for (const u of listed.users) ctx.trackUser(String(u.id));
      // F6: GET /v1/auth/:app_id/users?identifier= finds or creates.
      await knownBug(annotate, FINDINGS.identifierLookupCreatesUsers, listed.users.length > 0, "GET /v1/auth/:app_id/users?identifier=<unknown email> answered 200 with a new user");
    });

    it("a deleted user stays deleted when looked up by identifier (known bug F6: the lookup brings them back)", async ({ skip, annotate }) => {
      const ctx = get();
      const gone = deleted ?? skip("needs the deleted user");
      await ctx.admin.getUserByIdentifier(gone.email);
      const after = await ctx.admin.getUser(gone.id);
      // F6: the lookup's find-or-create undeletes the soft-deleted row. (Cleanup deletes it again.)
      await knownBug(annotate, FINDINGS.identifierLookupCreatesUsers, !after.error, `GET /v1/:app_id/users/:id answered ${after.error ? statusOf(after.error) : 200} after the lookup`);
    });
  });
}
