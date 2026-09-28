// DX-08 item 7: authorization. A policy imported as a document, roles, the
// backend checks (ScuteAdminApi), the signed-in user's own checks
// (ScuteAuthzApi), a signed snapshot with local decisions that match the
// server (ScuteLocalAuthz, decideLocally), and access requests.

import { beforeAll, describe, expect, it } from "vitest";
import {
  ScuteLocalAuthz,
  decideLocally,
  decodeSnapshotToken,
  verifySnapshotToken,
  type AuthzDecision,
  type AuthzPolicy,
} from "@scute/js-core";
import type { LiveContext } from "../lib/context";
import { done, ok } from "../lib/check";
import { FINDINGS, knownBug } from "../lib/findings";

/** The policy this run imports: one resource type, five roles, all prefixed live-<runid>. */
export function policyDocument(ctx: LiveContext) {
  const R = ctx.resource;
  return {
    scute_policy: 1,
    resources: {
      [R]: { name: `Live ${ctx.runId} documents`, actions: ["archive", "delete", "edit", "list", "purge", "read", "share"] },
    },
    permissions: {
      [`${R}:edit`]: { requires_verification: true },
      [`${R}:delete`]: { requires_approval: true },
      [`${R}:share`]: { blocked_while_impersonating: true },
    },
    roles: {
      [ctx.role("viewer")]: { name: `Live ${ctx.runId} viewer`, permissions: [`${R}:read`, `${R}:share`] },
      [ctx.role("editor")]: {
        name: `Live ${ctx.runId} editor`,
        permissions: [`${R}:delete`, `${R}:edit`, `${R}:read`, `${R}:share`],
      },
      [ctx.role("regional")]: {
        name: `Live ${ctx.runId} regional`,
        permissions: [{ permission: `${R}:archive`, when: { eq: [{ var: "user.region" }, "eu"] } }],
      },
      [ctx.role("everyone")]: { name: `Live ${ctx.runId} everyone`, default: true, permissions: [`${R}:list`] },
      [ctx.role("agent")]: { name: `Live ${ctx.runId} agent`, permissions: [`${R}:delete`, `${R}:edit`, `${R}:read`] },
    },
  };
}

type ImportAnswer = { dry_run: boolean; changes: { op: string; kind: string; key: string }[]; applied: boolean };

// No SDK method for importing a policy document: POST /v1/apps/:app_id/authz/policy/import.
const importPolicy = (ctx: LiveContext, dryRun: boolean) =>
  ctx.api.post<ImportAnswer>(`${ctx.api.appPath}/authz/policy/import`, { document: policyDocument(ctx), dry_run: dryRun });

// No SDK method for assigning or removing a role: POST/DELETE /v1/apps/:app_id/authz/users/:id/roles.
const assignRole = (ctx: LiveContext, userId: string, role: string) =>
  ctx.api.post(`${ctx.api.appPath}/authz/users/${userId}/roles`, { role });
const removeRole = (ctx: LiveContext, userId: string, role: string) =>
  ctx.api.delete(`${ctx.api.appPath}/authz/users/${userId}/roles/${encodeURIComponent(role)}`);

/** What each user may do in the matrix (and what the engine should say). */
const MATRIX: Record<"main" | "second", Record<string, AuthzDecision["decision"]>> = {
  // editor + regional (region eu) + everyone
  main: {
    read: "allow",
    edit: "allow_with_step_up",
    delete: "allow_with_approval",
    share: "allow",
    archive: "allow",
    list: "allow",
    purge: "deny",
    fly: "deny",
  },
  // viewer + regional (region us) + everyone
  second: {
    read: "allow",
    edit: "deny",
    delete: "deny",
    share: "allow",
    archive: "deny",
    list: "allow",
    purge: "deny",
    fly: "deny",
  },
};

export function authzSuite(get: () => LiveContext) {
  describe("7. authorization", () => {
    beforeAll(async () => {
      const ctx = get();
      // No SDK method for authz settings: PATCH /v1/apps/:app_id/authz/settings.
      // Client checks and access requests on, and every allow logged (the decision log test reads them back).
      await ctx.api.patch(`${ctx.api.appPath}/authz/settings`, { client_checks: true, access_requests: true, log_allow_rate: 1 });
    });

    it("imports the policy as a document: a dry run lists the changes, then it applies, and again changes nothing", async () => {
      const ctx = get();
      const plan = (await importPolicy(ctx, true)).data;
      expect(plan.dry_run).toBe(true);
      expect(plan.applied).toBe(false);
      expect(plan.changes.some((c) => c.kind === "resource" && c.key === ctx.resource && c.op === "create")).toBe(true);
      expect(plan.changes.filter((c) => c.kind === "role" && c.op === "create").length).toBe(5);

      const applied = (await importPolicy(ctx, false)).data;
      expect(applied.applied).toBe(true);
      ctx.state.policyImported = true;

      const again = (await importPolicy(ctx, false)).data;
      expect(again.changes, "importing the same document twice changes nothing").toEqual([]);

      // No SDK method: GET /v1/apps/:app_id/authz/policy/document.
      const { data: exported } = await ctx.api.get(`${ctx.api.appPath}/authz/policy/document`);
      expect([...exported.resources[ctx.resource].actions].sort()).toEqual(["archive", "delete", "edit", "list", "purge", "read", "share"]);
      expect(exported.permissions[ctx.perm("edit")]).toMatchObject({ requires_verification: true });
      expect(exported.roles[ctx.role("everyone")].default).toBe(true);
    });

    it("assigns roles and removes one", async ({ skip }) => {
      const ctx = get();
      if (!ctx.state.policyImported) skip("needs the imported policy");
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const second = ctx.state.second ?? skip("needs the created user");

      await assignRole(ctx, main.id, ctx.role("editor"));
      await assignRole(ctx, main.id, ctx.role("regional"));
      await assignRole(ctx, second.id, ctx.role("viewer"));
      await assignRole(ctx, second.id, ctx.role("regional"));
      ok(await ctx.admin.updateUser(main.id, { authz_attributes: { region: "eu" } }), "updateUser (region)");

      await assignRole(ctx, second.id, ctx.role("editor"));
      expect(ok(await ctx.admin.authzUserPermissions(second.id), "authzUserPermissions").roles).toContain(ctx.role("editor"));
      await removeRole(ctx, second.id, ctx.role("editor"));
      const roles = ok(await ctx.admin.authzUserPermissions(second.id), "authzUserPermissions").roles;
      expect(roles).not.toContain(ctx.role("editor"));
      expect(roles).toEqual(expect.arrayContaining([ctx.role("viewer"), ctx.role("regional"), ctx.role("everyone")]));
    });

    it("checks one permission from the backend (authzCheck)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const second = ctx.state.second ?? skip("needs the created user");

      const read = ok(await ctx.admin.authzCheck({ userId: main.id, action: "read", resource: `${ctx.resource}:1` }), "authzCheck");
      expect(read.decision, read.reason).toBe("allow");
      expect(read.allowed).toBe(true);
      expect(read.roles).toContain(ctx.role("editor"));

      const edit = ok(await ctx.admin.authzCheck({ userId: main.id, action: "edit", resource: ctx.resource }), "authzCheck");
      expect(edit.decision, edit.reason).toBe("allow_with_step_up");
      expect(edit.allowed).toBe(false);
      expect(edit.step_up?.authorizes_action).toBe(ctx.perm("edit"));

      const del = ok(await ctx.admin.authzCheck({ userId: main.id, action: "delete", resource: ctx.resource }), "authzCheck");
      expect(del.decision, del.reason).toBe("allow_with_approval");

      const denied = ok(await ctx.admin.authzCheck({ userId: second.id, action: "edit", resource: ctx.resource }), "authzCheck");
      expect(denied.decision).toBe("deny");
      expect(denied.reason).toBe("no_role_grants_permission");
    });

    it("checks many at once, for several users (authzCheckBatch)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const second = ctx.state.second ?? skip("needs the created user");
      const results = ok(
        await ctx.admin.authzCheckBatch([
          { userId: main.id, action: "read", resource: ctx.resource },
          { userId: second.id, action: "archive", resource: ctx.resource },
          { userId: main.id, action: "purge", resource: ctx.resource },
          { userId: main.id, action: "archive", resource: ctx.resource },
        ]),
        "authzCheckBatch"
      );
      expect(results.map((r) => r.decision)).toEqual(["allow", "deny", "deny", "allow"]);
      expect(results[1].reason).toBe("condition_failed");
    });

    it("lists what a user may do (authzUserPermissions)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const p = ok(await ctx.admin.authzUserPermissions(main.id), "authzUserPermissions");
      expect(p.roles).toEqual(expect.arrayContaining([ctx.role("editor"), ctx.role("regional"), ctx.role("everyone")]));
      expect(p.permissions).toEqual(expect.arrayContaining([ctx.perm("read"), ctx.perm("share"), ctx.perm("list"), ctx.perm("archive")]));
      expect(p.permissions).not.toContain(ctx.perm("purge"));
      expect(p.step_up).toContain(ctx.perm("edit"));
    });

    it("lists who may do something (authzAuthorizedUsers)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const second = ctx.state.second ?? skip("needs the created user");
      const readers = ok(await ctx.admin.authzAuthorizedUsers({ action: "read", resource: ctx.resource }), "authzAuthorizedUsers");
      expect(readers.everyone).toBe(false);
      expect(readers.users.map((u) => String(u.id))).toEqual(expect.arrayContaining([main.id, second.id]));

      const listers = ok(await ctx.admin.authzAuthorizedUsers({ action: "list", resource: ctx.resource }), "authzAuthorizedUsers");
      expect(listers.everyone, "a default role grants list").toBe(true);
    });

    it("builds a data filter for lists (authzFilter)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const second = ctx.state.second ?? skip("needs the created user");
      const all = ok(await ctx.admin.authzFilter({ userId: main.id, action: "read", resourceType: ctx.resource }), "authzFilter");
      expect(all.filter).toBe("all");
      const none = ok(await ctx.admin.authzFilter({ userId: second.id, action: "edit", resourceType: ctx.resource }), "authzFilter");
      expect(none.filter).toBe("none");
    });

    it("redeems a step-up: authzStartStepUp, the person's code, then authzCheck with the challenge", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const decision = ok(await ctx.admin.authzCheck({ userId: main.id, action: "edit", resource: ctx.resource }), "authzCheck");
      expect(decision.decision).toBe("allow_with_step_up");

      const { challenge } = ok(await ctx.admin.authzStartStepUp({ userId: main.id, decision, method: "email_otp" }), "authzStartStepUp");
      expect(challenge.status).toBe("pending");

      // No SDK method finishes a challenge from the backend (the person's code
      // arrives in your app): POST /v1/auth/:app_id/challenges/:token/verify.
      const { data: verified } = await ctx.api.post(`${ctx.api.authPath}/challenges/${encodeURIComponent(challenge.token)}/verify`, {
        code: "424242",
      });
      expect(verified.status).toBe("completed");

      const allowed = ok(
        await ctx.admin.authzCheck({ userId: main.id, action: "edit", resource: ctx.resource, challenge: challenge.token }),
        "authzCheck with the challenge"
      );
      expect(allowed.decision, allowed.reason).toBe("allow");
      expect(allowed.reason).toBe("verified");

      const spent = ok(
        await ctx.admin.authzCheck({ userId: main.id, action: "edit", resource: ctx.resource, challenge: challenge.token }),
        "authzCheck with the same challenge"
      );
      expect(spent.decision, "a challenge is spent once").toBe("allow_with_step_up");
    });

    it("the signed-in user checks their own permissions (authz.can, canMany, permissions, reviews)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const can = ok(await main.client.authz.can("read", `${ctx.resource}:1`), "authz.can");
      expect(can.decision).toBe("allow");
      const cannot = ok(await main.client.authz.can("purge", ctx.resource), "authz.can");
      expect(cannot.decision).toBe("deny");

      const many = ok(
        await main.client.authz.canMany([
          { action: "read", resource: ctx.resource },
          { action: "edit", resource: ctx.resource },
          { action: "delete", resource: ctx.resource },
        ]),
        "authz.canMany"
      );
      expect(many.map((d) => d.decision)).toEqual(["allow", "allow_with_step_up", "allow_with_approval"]);

      const mine = ok(await main.client.authz.permissions(), "authz.permissions");
      expect(mine.roles).toContain(ctx.role("editor"));
      expect(mine.permissions).toContain(ctx.perm("read"));

      expect(ok(await main.client.authz.reviews(), "authz.reviews"), "not a reviewer").toEqual([]);
    });

    it("verifies the policy snapshot against the app's JWKS, with the app id the SDK is configured with (verifySnapshotToken; known bug F3)", async ({ annotate }) => {
      const ctx = get();
      const snap = ok(await ctx.admin.authzSnapshot(), "authzSnapshot");
      expect(snap.token.split(".").length).toBe(3);
      const { data: jwks } = await ctx.api.get(snap.jwks, { auth: "none" });

      // The signature itself verifies against the JWKS (checked with the token's own audience).
      const own = await verifySnapshotToken(snap.token, jwks, decodeSnapshotToken(snap.token).aud);
      expect(own.version).toBe(snap.version);
      expect(own.policy.permissions[ctx.perm("edit")]?.requires_verification).toBe(true);

      // F3: the snapshot's aud is the app's internal UUID, not the app_... id the SDK knows.
      let refusal = "";
      try {
        await verifySnapshotToken(snap.token, jwks, ctx.env.appId);
      } catch (e) {
        refusal = (e as Error).message;
      }
      if (refusal && refusal !== "Snapshot is for another app") throw new Error(`verifySnapshotToken: ${refusal}`);
      await knownBug(annotate, FINDINGS.snapshotAudIsInternalId, refusal === "Snapshot is for another app", `verifySnapshotToken(token, jwks, "app_...") threw "${refusal}"`);
    });

    it("refuses a tampered snapshot and an expired one (verifySnapshotToken)", async () => {
      const ctx = get();
      const snap = ok(await ctx.admin.authzSnapshot(), "authzSnapshot");
      const { data: jwks } = await ctx.api.get(snap.jwks, { auth: "none" });
      const claims = decodeSnapshotToken(snap.token);
      // Checked with the snapshot's own audience, so only the signature and the expiry are on trial here.
      const [h, , s] = snap.token.split(".");
      const forged = Buffer.from(JSON.stringify({ ...claims, version: claims.version + 1000 })).toString("base64url");
      await expect(verifySnapshotToken(`${h}.${forged}.${s}`, jwks, claims.aud)).rejects.toThrow(/Bad signature/);
      await expect(verifySnapshotToken(snap.token, jwks, claims.aud, new Date((claims.exp + 60) * 1000))).rejects.toThrow(/expired/);
      await expect(verifySnapshotToken(snap.token, jwks, "app_someone_else")).rejects.toThrow(/another app/);
    });

    it("decides locally exactly like the server over a small matrix (ScuteLocalAuthz, decideLocally)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const second = ctx.state.second ?? skip("needs the created user");
      const users = { main: { id: main.id, region: "eu" }, second: { id: second.id, region: "us" } };

      const snap = ok(await ctx.admin.authzSnapshot(), "authzSnapshot");
      const policy = decodeSnapshotToken(snap.token).policy as AuthzPolicy;
      const local = new ScuteLocalAuthz(ctx.admin, { refreshMs: 60_000 });

      const mismatches: string[] = [];
      for (const who of ["main", "second"] as const) {
        const { id, region } = users[who];
        const { roles } = ok(await ctx.admin.authzUserPermissions(id), "authzUserPermissions");
        for (const [action, expected] of Object.entries(MATRIX[who])) {
          const server = ok(await ctx.admin.authzCheck({ userId: id, action, resource: ctx.resource }), "authzCheck");
          const fn = decideLocally(policy, { roles, user: { region }, action, resource: ctx.resource });
          const viaClass = await local.check({ userId: id, action, resource: ctx.resource, user: { region } });
          const row = `${who} ${action}: server ${server.decision} (${server.reason}), decideLocally ${fn.decision} (${fn.reason}), ScuteLocalAuthz ${viaClass?.decision}`;
          if (server.decision !== expected || fn.decision !== server.decision || viaClass?.decision !== server.decision) mismatches.push(row);
        }
      }

      // A "not while impersonating" permission, with the context a backend sends in such a session.
      const context = { impersonated: true, actor: { kind: "backend", email: "support@example.com" } };
      const { roles } = ok(await ctx.admin.authzUserPermissions(main.id), "authzUserPermissions");
      const server = ok(await ctx.admin.authzCheck({ userId: main.id, action: "share", resource: ctx.resource, context }), "authzCheck");
      const fn = decideLocally(policy, { roles, user: { region: "eu" }, action: "share", resource: ctx.resource, context });
      if (server.decision !== "deny" || fn.decision !== "deny" || server.reason !== fn.reason) {
        mismatches.push(`main share while impersonated: server ${server.decision} (${server.reason}), local ${fn.decision} (${fn.reason})`);
      }

      expect(mismatches, mismatches.join("\n")).toEqual([]);
      expect(local.policyVersion).toBe(snap.version);
    });

    it("access requests: the user asks to approve one operation, the backend approves, and the check spends it once", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const resource = `${ctx.resource}:7`;

      const req = ok(await main.client.authz.requestAccess({ action: "delete", resource, reason: `${ctx.prefix}: tidy up` }), "authz.requestAccess");
      expect(req.status).toBe("pending");
      expect(req.kind).toBe("operation");
      expect(req.permission).toBe(ctx.perm("delete"));

      const mine = ok(await main.client.authz.myRequests("pending"), "authz.myRequests");
      expect(mine.map((r) => String(r.id))).toContain(String(req.id));
      const listed = ok(await ctx.admin.authzRequests({ status: "pending", userId: main.id }), "authzRequests");
      expect(listed.map((r) => String(r.id))).toContain(String(req.id));

      const approved = ok(await ctx.admin.authzDecideRequest(req.id, "approve", { note: "live test" }), "authzDecideRequest");
      expect(approved.status).toBe("approved");

      const first = ok(await ctx.admin.authzCheck({ userId: main.id, action: "delete", resource, approval: req.id }), "authzCheck");
      expect(first.decision, first.reason).toBe("allow");
      expect(first.reason).toBe("approved");
      const again = ok(await ctx.admin.authzCheck({ userId: main.id, action: "delete", resource, approval: req.id }), "authzCheck");
      expect(again.decision, "an approval works once").toBe("allow_with_approval");
    });

    it("access requests for a role: the backend files one, denies it, then approves another (the role is granted)", async ({ skip }) => {
      const ctx = get();
      const second = ctx.state.second ?? skip("needs the created user");
      const editor = ctx.role("editor");

      const first = ok(await ctx.admin.authzCreateRequest(second.id, { role: editor, reason: "live test" }), "authzCreateRequest");
      expect(first.kind).toBe("role");
      expect(first.status).toBe("pending");
      const denied = ok(await ctx.admin.authzDecideRequest(first.id, "deny", { note: "not this one" }), "authzDecideRequest");
      expect(denied.status).toBe("denied");
      expect(ok(await ctx.admin.authzUserPermissions(second.id), "authzUserPermissions").roles).not.toContain(editor);

      const second2 = ok(await ctx.admin.authzCreateRequest(second.id, { role: editor, duration: 3600 }), "authzCreateRequest");
      const approved = ok(await ctx.admin.authzDecideRequest(second2.id, "approve"), "authzDecideRequest");
      expect(approved.status).toBe("approved");
      expect(ok(await ctx.admin.authzUserPermissions(second.id), "authzUserPermissions").roles).toContain(editor);
    });

    it("the user files a request and cancels it (requestAccess, cancelRequest)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const req = ok(await main.client.authz.requestAccess({ role: ctx.role("viewer"), reason: "live test" }), "authz.requestAccess");
      expect(req.status).toBe("pending");
      done(await main.client.authz.cancelRequest(req.id), "authz.cancelRequest");
      const mine = ok(await main.client.authz.myRequests(), "authz.myRequests");
      expect(mine.find((r) => String(r.id) === String(req.id))?.status).toBe("cancelled");
    });
  });
}
