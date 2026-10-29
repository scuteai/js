/**
 * Managing roles and permissions, verifying a step-up code, and reading the
 * decision log, all from your backend with the secret key. Pins the request
 * shapes against a stubbed fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScuteAdminApi from "../ScuteAdminApi";
import { BaseHttpError } from "../lib/errors";
import { APP_ID, BASE_URL, createServer, type TestServer } from "./harness";

let server: TestServer;
const apps = `/v1/apps/${APP_ID}/authz`;
const auth = `/v1/auth/${APP_ID}`;
const admin = () => new ScuteAdminApi({ appId: APP_ID, baseUrl: BASE_URL, secretKey: "sk_test" });

beforeEach(() => {
  server = createServer({ appData: null });
  vi.spyOn(console, "warn").mockImplementation(() => {}); // secret-key-in-browser warning under jsdom
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resources", () => {
  it("lists, creates, changes and deletes", async () => {
    const project = { slug: "project", name: "Project", actions: ["view", "edit"], roles: [], relations: [] };
    server.on("GET", `${apps}/resources`, { body: { resources: [project] } });
    server.on("POST", `${apps}/resources`, { status: 201, body: project });
    server.on("PATCH", `${apps}/resources/project`, { body: { ...project, actions: ["view"] } });
    server.on("DELETE", `${apps}/resources/project`, { status: 204 });

    const listed = await admin().authzResources();
    const created = await admin().authzCreateResource({ slug: "project", name: "Project", actions: ["view", "edit"] });
    const updated = await admin().authzUpdateResource("project", { actions: ["view"], force: true });
    const deleted = await admin().authzDeleteResource("project", { force: true });

    expect(listed.data).toEqual([project]);
    expect(created.data?.slug).toBe("project");
    expect(updated.data?.actions).toEqual(["view"]);
    expect(deleted.error).toBeNull();
    expect(server.calls.map((c) => c.headers["authorization"])).toEqual(Array(4).fill("Bearer sk_test"));
    expect(server.calls[1].body).toEqual({ slug: "project", name: "Project", actions: ["view", "edit"] });
    expect(server.calls[2].body).toEqual({ actions: ["view"], force: true });
    expect(server.calls[3].query.get("force")).toBe("true");
  });

  it("does not send force unless asked", async () => {
    server.on("DELETE", `${apps}/resources/project`, { status: 204 });

    await admin().authzDeleteResource("project");

    expect(server.calls[0].url).not.toContain("force");
  });
});

describe("permissions", () => {
  const slug = "project:edit";
  const encoded = "project%3Aedit";
  const permission = { slug, name: "Edit", enabled: true, resource: "project", action: "edit", custom: false, requires_verification: false };

  it("lists and creates a custom one", async () => {
    server.on("GET", `${apps}/permissions`, { body: { permissions: [permission] } });
    server.on("POST", `${apps}/permissions`, { status: 201, body: { ...permission, slug: "export_reports", custom: true } });

    const listed = await admin().authzPermissions();
    const created = await admin().authzCreatePermission({ slug: "export_reports", name: "Export reports" });

    expect(listed.data?.[0].slug).toBe(slug);
    expect(created.data?.custom).toBe(true);
    expect(server.calls[1].body).toEqual({ slug: "export_reports", name: "Export reports" });
  });

  it("asks for a step-up on a permission", async () => {
    server.on("PATCH", `${apps}/permissions/${encoded}`, { body: { ...permission, requires_verification: true } });

    const { data } = await admin().authzUpdatePermission(slug, {
      requires_verification: true,
      verification_method: "email_otp",
      verification_ttl: 300,
    });

    expect(data?.requires_verification).toBe(true);
    expect(server.calls[0].body).toEqual({ requires_verification: true, verification_method: "email_otp", verification_ttl: 300 });
  });

  it("deletes, with force when roles grant it", async () => {
    server.on("DELETE", `${apps}/permissions/export_reports`, { status: 204 });

    const { error } = await admin().authzDeletePermission("export_reports", { force: true });

    expect(error).toBeNull();
    expect(server.calls[0].query.get("force")).toBe("true");
  });

  it("returns the API's refusal as an error", async () => {
    server.on("DELETE", `${apps}/permissions/${encoded}`, {
      status: 409,
      body: { error: "Remove the action from its resource instead", error_code: "owned_by_resource" },
    });

    const { data, error } = await admin().authzDeletePermission(slug);

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(BaseHttpError);
    expect((error as BaseHttpError).code).toBe(409);
    expect((error as BaseHttpError).json?.error_code).toBe("owned_by_resource");
  });
});

describe("roles", () => {
  const editor = { slug: "editor", name: "Editor", is_default: false, deletable: true, permissions: ["project:edit", "project:view"], holders: 2 };

  it("lists roles", async () => {
    server.on("GET", `${apps}/roles`, { body: { roles: [editor] } });

    const { data } = await admin().authzRoles();

    expect(data).toEqual([editor]);
  });

  it("creates a role with a conditional grant and changes it", async () => {
    const permissions = ["project:view", { permission: "invoice:approve", when: { lt: [{ var: "resource.amount" }, 5000] } }];
    server.on("POST", `${apps}/roles`, { status: 201, body: editor });
    server.on("PATCH", `${apps}/roles/editor`, { body: { ...editor, is_default: true } });

    await admin().authzCreateRole({ slug: "editor", name: "Editor", is_default: false, permissions });
    const { data } = await admin().authzUpdateRole("editor", { is_default: true, permissions: ["project:view"] });

    expect(server.calls[0].body).toEqual({ slug: "editor", name: "Editor", is_default: false, permissions });
    expect(server.calls[1].body).toEqual({ is_default: true, permissions: ["project:view"] });
    expect(data?.is_default).toBe(true);
  });

  it("moves holders to another role on delete", async () => {
    server.on("DELETE", `${apps}/roles/editor`, { status: 204 });

    const { error } = await admin().authzDeleteRole("editor", { reassignTo: "viewer" });

    expect(error).toBeNull();
    expect(server.calls[0].query.get("reassign_to")).toBe("viewer");
  });

  it("deletes without a target when nobody holds it", async () => {
    server.on("DELETE", `${apps}/roles/editor`, { status: 204 });

    await admin().authzDeleteRole("editor");

    expect(server.calls[0].query.has("reassign_to")).toBe(false);
  });
});

describe("a user's roles", () => {
  it("reads, assigns with an expiry, and revokes", async () => {
    const expiry = new Date("2030-01-01T00:00:00Z");
    server.on("GET", `${apps}/users/u%201/roles`, {
      body: { user_id: "u 1", roles: [{ role: "editor", expires_at: null, source: "manual", active: true }], default_roles: ["viewer"], resource_roles: [] },
    });
    server.on("POST", `${apps}/users/u%201/roles`, {
      status: 201,
      body: { role: "editor", expires_at: expiry.toISOString(), source: "manual", active: true },
    });
    server.on("DELETE", `${apps}/users/u%201/roles/editor`, { status: 204 });

    const held = await admin().authzUserRoles("u 1");
    const granted = await admin().authzAssignRole("u 1", "editor", { expiresAt: expiry });
    const revoked = await admin().authzRevokeRole("u 1", "editor");

    expect(held.data?.default_roles).toEqual(["viewer"]);
    expect(granted.data?.role).toBe("editor");
    expect(server.calls[1].body).toEqual({ role: "editor", expires_at: "2030-01-01T00:00:00.000Z" });
    expect(revoked.error).toBeNull();
  });

  it("assigns for good without an expiry", async () => {
    server.on("POST", `${apps}/users/u1/roles`, { status: 201, body: { role: "editor", expires_at: null, source: "manual", active: true } });

    await admin().authzAssignRole("u1", "editor");

    expect(server.calls[0].body).toEqual({ role: "editor" });
  });

  it("reports a missing user", async () => {
    server.on("GET", `${apps}/users/nope/roles`, { status: 404, body: { error: "User not found", error_code: "user_not_found" } });

    const { data, error } = await admin().authzUserRoles("nope");

    expect(data).toBeNull();
    expect((error as BaseHttpError).code).toBe(404);
  });
});

describe("settings", () => {
  it("reads and changes", async () => {
    const settings = { log_allow_rate: 1, log_retention_days: 90, client_checks: true, access_requests: false, gateway: false, gateway_unmatched: "deny" };
    server.on("GET", `${apps}/settings`, { body: { ...settings, client_checks: false } });
    server.on("PATCH", `${apps}/settings`, { body: settings });

    const before = await admin().authzSettings();
    const after = await admin().authzUpdateSettings({ client_checks: true, log_allow_rate: 1 });

    expect(before.data?.client_checks).toBe(false);
    expect(after.data?.client_checks).toBe(true);
    expect(server.calls[1].body).toEqual({ client_checks: true, log_allow_rate: 1 });
  });
});

describe("verifying a step-up code", () => {
  it("sends the code with the secret key", async () => {
    server.on("POST", `${auth}/challenges/ch_1/verify`, {
      body: { status: "completed", challenge: { token: "ch_1", status: "completed", purpose: "step_up", method: "email_otp", expires_at: "2030-01-01T00:00:00Z" } },
    });

    const { data, error } = await admin().authzVerifyStepUp("ch_1", "123456");

    expect(error).toBeNull();
    expect(data?.status).toBe("completed");
    const [call] = server.calls;
    expect(call.headers["authorization"]).toBe("Bearer sk_test");
    expect(call.body).toEqual({ code: "123456" });
  });

  it("encodes the token in the path", async () => {
    server.on("POST", `${auth}/challenges/a%2Fb/verify`, { body: { status: "completed", challenge: {} } });

    const { error } = await admin().authzVerifyStepUp("a/b", "1");

    expect(error).toBeNull();
  });

  it("answers a wrong code with an error that says how many tries are left", async () => {
    server.on("POST", `${auth}/challenges/ch_1/verify`, { status: 422, body: { error: "Invalid code", remaining_attempts: 2 } });

    const { data, error } = await admin().authzVerifyStepUp("ch_1", "000000");

    expect(data).toBeNull();
    expect((error as BaseHttpError).code).toBe(422);
    expect((error as BaseHttpError).json?.remaining_attempts).toBe(2);
  });
});

describe("decision log", () => {
  const row = { id: "d2", at: "2030-01-01T00:00:00.000Z", user_id: "u1", permission: "project:edit", decision: "allow", reason: "role_grant", roles: ["editor"], seq: 2 };

  it("lists the newest entries with filters", async () => {
    server.on("GET", `${apps}/decisions`, { body: { decisions: [row], next: "d1" } });

    const { data } = await admin().authzDecisions({
      userId: "u1",
      decision: "deny",
      permission: "project:edit",
      resource: "project:1",
      reason: "no_grant",
      agentId: "a1",
      taskId: "t1",
      since: "2030-01-01T00:00:00Z",
      until: new Date("2030-02-01T00:00:00Z"),
      limit: 5,
      before: "d9",
    });

    expect(data?.decisions[0].permission).toBe("project:edit");
    expect(data?.next).toBe("d1");
    const [call] = server.calls;
    expect(call.headers["authorization"]).toBe("Bearer sk_test");
    expect(Object.fromEntries(call.query)).toEqual({
      user_id: "u1",
      decision: "deny",
      permission: "project:edit",
      resource: "project:1",
      reason: "no_grant",
      agent_id: "a1",
      task_id: "t1",
      since: "2030-01-01T00:00:00.000Z",
      until: "2030-02-01T00:00:00.000Z",
      limit: "5",
      before: "d9",
    });
  });

  it("lists everything without filters", async () => {
    server.on("GET", `${apps}/decisions`, { body: { decisions: [] } });

    const { data } = await admin().authzDecisions();

    expect(data).toEqual({ decisions: [] });
    expect(server.calls[0].url).not.toContain("?");
  });

  it("reports a bad filter", async () => {
    server.on("GET", `${apps}/decisions`, { status: 422, body: { error: "since must be a time", error_code: "invalid" } });

    const { error } = await admin().authzDecisions({ limit: 1 });

    expect((error as BaseHttpError).code).toBe(422);
  });

  it("sends the person's address when set", async () => {
    server.on("GET", `${apps}/decisions`, { body: { decisions: [] } });

    await admin().withClientIp("203.0.113.7").authzDecisions();

    expect(server.calls[0].headers["x-scute-client-ip"]).toBe("203.0.113.7");
  });
});
