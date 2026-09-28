// DX-08 item 5: managing users from the backend (ScuteAdminApi).

import { describe, expect, it } from "vitest";
import type { LiveContext } from "../lib/context";
import { done, failed, ok } from "../lib/check";

type ManagedUser = { id: string | number; email: string | null; status: string; authz_attributes?: Record<string, unknown> };

export function usersSuite(get: () => LiveContext) {
  describe("5. admin users", () => {
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
      const { user } = ok(await ctx.admin.createUser(ctx.email("deleted")), "createUser");
      const id = String(user.id);
      ctx.trackUser(id);
      done(await ctx.admin.deleteUser(id), "deleteUser");
      expect(failed(await ctx.admin.getUser(id), "getUser of a deleted user").status).toBe(404);
    });
  });
}
