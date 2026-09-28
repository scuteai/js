// F8, settled by api#136: a deleted user who signs in again gets a fresh
// account (a new app user id; the old one stays deleted with its data), an
// admin can list the person's previous accounts and merge one in, and
// someone deactivated and then deleted is refused at sign-in.
//
// No SDK method lists or merges previous accounts yet (DX-09):
// GET /v1/:app_id/users/:id/previous_accounts, POST /v1/:app_id/users/:id/merge.

import { describe, expect, it } from "vitest";
import type { LiveContext } from "../lib/context";
import { PHASE } from "../lib/context";
import { done, failed, ok, refusal } from "../lib/check";
import { otpSignIn } from "../lib/flows";

type PreviousAccount = { id: string; status: string; deleted_at?: string; merged_into?: string; roles: number };
type ManagedUser = { id: string; authz_attributes?: Record<string, unknown> };

export function accountsSuite(get: () => LiveContext) {
  describe("5b. an account after it's deleted (F8)", () => {
    let oldId: string | undefined;
    let freshId: string | undefined;

    const previousAccounts = async (ctx: LiveContext, id: string) =>
      (await ctx.api.get<{ previous_accounts: PreviousAccount[] }>(`/v1/${ctx.env.appId}/users/${id}/previous_accounts`)).data
        .previous_accounts;
    const merge = (ctx: LiveContext, into: string, from: string, expect?: number[]) =>
      ctx.api.post<{ user_id: string; merged: string; moved: Record<string, number> }>(`/v1/${ctx.env.appId}/users/${into}/merge`, { from }, { expect });
    const attributesOf = async (ctx: LiveContext, id: string) =>
      ((ok(await ctx.admin.getUser(id), "getUser").user as unknown as ManagedUser).authz_attributes ?? {}) as Record<string, unknown>;

    it("a deleted user who signs in again gets a fresh account; the old one stays deleted (404)", async ({ skip }) => {
      const ctx = get();
      if (!ctx.state.policyImported) skip("needs the imported policy (a role to give the old account)");
      const email = ctx.email("returning");

      // The old account: a role and an attribute, then deleted by an admin.
      const { user } = ok(await ctx.admin.createUser(email), "createUser");
      oldId = String(user.id);
      ctx.trackUser(oldId);
      // No SDK method for role assignments: POST /v1/apps/:app_id/authz/users/:id/roles.
      await ctx.api.post(`${ctx.api.appPath}/authz/users/${oldId}/roles`, { role: ctx.role("viewer") });
      ok(await ctx.admin.updateUser(oldId, { authz_attributes: { region: "eu" } }), "updateUser");
      done(await ctx.admin.deleteUser(oldId), "deleteUser");
      expect(failed(await ctx.admin.getUser(oldId), "getUser of the deleted account").status).toBe(404);

      // The person signs in again.
      const client = ctx.newClient();
      const outcome = await otpSignIn(client, email, "sendLoginOtp");
      expect(outcome.kind).toBe("signed_in");
      const fresh = ok(await client.getUser(), "getUser").user;
      freshId = String(fresh?.id);
      ctx.trackUser(freshId);
      // Should the merge test not get there, merge here so the role moves to a live account cleanup can take it from.
      const into = freshId;
      const from = oldId;
      ctx.cleanup.add(PHASE.merges, `merge the previous account of user ${into}`, () => merge(ctx, into, from, [200, 404, 422]));

      expect(freshId, "a new app user id").not.toBe(oldId);
      expect(failed(await ctx.admin.getUser(oldId), "getUser of the old account").status, "the old account stays deleted").toBe(404);
      expect(ok(await ctx.admin.authzUserPermissions(freshId), "authzUserPermissions").roles).not.toContain(ctx.role("viewer"));
      expect((await attributesOf(ctx, freshId)).region, "the fresh account starts empty").toBeUndefined();
    });

    it("previous_accounts lists the old account (no SDK method yet)", async ({ skip }) => {
      const ctx = get();
      const into = freshId ?? skip("needs the fresh account");
      const from = oldId ?? skip("needs the old account");
      const previous = await previousAccounts(ctx, into);
      const old = previous.find((a) => a.id === from);
      expect(old, "the deleted account is listed").toBeTruthy();
      expect(old?.roles).toBe(1);
      expect(Boolean(old?.deleted_at)).toBe(true);
      expect(old?.merged_into).toBeUndefined();
    });

    it("merge moves the old account's role and attributes in; a second merge answers 422 already_merged", async ({ skip }) => {
      const ctx = get();
      const into = freshId ?? skip("needs the fresh account");
      const from = oldId ?? skip("needs the old account");
      const { data } = await merge(ctx, into, from);
      expect(data.user_id).toBe(into);
      expect(data.merged).toBe(from);
      expect(data.moved.roles).toBe(1);

      expect(ok(await ctx.admin.authzUserPermissions(into), "authzUserPermissions").roles).toContain(ctx.role("viewer"));
      expect((await attributesOf(ctx, into)).region, "attributes the live account lacks come over").toBe("eu");
      expect((await previousAccounts(ctx, into)).find((a) => a.id === from)?.merged_into).toBe(into);
      expect(failed(await ctx.admin.getUser(from), "getUser of the merged account").status, "the old account stays deleted").toBe(404);

      const again = await refusal(() => merge(ctx, into, from));
      expect(again.status).toBe(422);
      expect(again.code).toBe("already_merged");
    });

    it("someone deactivated and then deleted is refused at sign-in (403 account_deactivated), and nothing is made", async () => {
      const ctx = get();
      const email = ctx.email("deprovisioned");
      const { user } = ok(await ctx.admin.createUser(email), "createUser");
      const id = String(user.id);
      ctx.trackUser(id);
      ok(await ctx.admin.deactivateUser(id), "deactivateUser");
      done(await ctx.admin.deleteUser(id), "deleteUser");

      const refused = failed(await ctx.newClient().sendLoginOtp(email), "sendLoginOtp for a deprovisioned user");
      expect(refused.status).toBe(403);
      expect(refused.code).toBe("account_deactivated");
      const listed = ok(await ctx.admin.listUsers({ email }), "listUsers");
      for (const u of listed.users) ctx.trackUser(String(u.id));
      expect(listed.users.length, "no fresh account").toBe(0);
    });
  });
}
