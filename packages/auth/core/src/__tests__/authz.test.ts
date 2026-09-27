/**
 * Authorization API surfaces: scute.authz (the signed-in user, session
 * token) and the server helpers on ScuteAdminApi (secret key). Pins the
 * request shapes against a stubbed fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScuteAuthzApi from "../ScuteAuthzApi";
import ScuteAdminApi from "../ScuteAdminApi";
import { APP_ID, BASE_URL, createServer, type TestServer } from "./harness";

let server: TestServer;

beforeEach(() => {
  server = createServer({ appData: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const allow = { decision: "allow", allowed: true, reason: "role_grant", permission: "document:edit" };

describe("scute.authz (signed-in user)", () => {
  const api = (token: string | null = "access.jwt") =>
    new ScuteAuthzApi({ appId: APP_ID, baseUrl: BASE_URL, getAccessToken: async () => token });

  it("checks with the session token", async () => {
    server.on("POST", `/v1/auth/${APP_ID}/authz/me/check`, { body: allow });

    const { data, error } = await api().can("edit", "document:42", { channel: "web" });

    expect(error).toBeNull();
    expect(data?.allowed).toBe(true);
    const [call] = server.callsTo("POST", `/v1/auth/${APP_ID}/authz/me/check`);
    expect(call.headers["x-authorization"]).toBe("access.jwt");
    expect(call.body).toEqual({ action: "edit", resource: "document:42", context: { channel: "web" } });
  });

  it("returns batch results in order", async () => {
    server.on("POST", `/v1/auth/${APP_ID}/authz/me/check-batch`, {
      body: { results: [allow, { ...allow, decision: "deny", allowed: false }] },
    });

    const { data } = await api().canMany([{ action: "edit", resource: "document" }, { action: "delete" }]);

    expect(data?.map((d) => d.decision)).toEqual(["allow", "deny"]);
  });

  it("asks for permissions on one object", async () => {
    server.on("GET", `/v1/auth/${APP_ID}/authz/me/permissions`, {
      body: { user_id: "u1", roles: [], permissions: ["document:read"], step_up: [] },
    });

    await api().permissions("document:42");

    expect(server.calls[0].query.get("resource")).toBe("document:42");
  });

  it("files, lists and reviews access requests with the session token", async () => {
    server.on("POST", `/v1/auth/${APP_ID}/authz/me/requests`, { status: 201, body: { id: "req_1", status: "pending" } });
    server.on("GET", `/v1/auth/${APP_ID}/authz/me/reviews`, { body: { requests: [{ id: "req_2", status: "pending" }] } });
    server.on("POST", `/v1/auth/${APP_ID}/authz/me/reviews/req_2/deny`, { body: { id: "req_2", status: "denied" } });

    const created = await api().requestAccess({ action: "pay", resource: "invoice:9", reason: "vendor call" });
    const reviews = await api().reviews();
    const denied = await api().denyRequest("req_2", "not this quarter");

    expect(created.data?.id).toBe("req_1");
    expect(reviews.data?.map((r) => r.id)).toEqual(["req_2"]);
    expect(denied.data?.status).toBe("denied");
    expect(server.calls.every((c) => c.headers["x-authorization"] === "access.jwt")).toBe(true);
  });

  it("surfaces the API's refusal when client checks are off", async () => {
    server.on("POST", `/v1/auth/${APP_ID}/authz/me/check`, {
      status: 403,
      body: { error: "Client-side permission checks are off for this app", error_code: "client_checks_disabled" },
    });

    const { data, error } = await api().can("edit");

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe("ScuteAdminApi authorization helpers (server)", () => {
  const admin = () => new ScuteAdminApi({ appId: APP_ID, baseUrl: BASE_URL, secretKey: "sk_test" });

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {}); // secret-key-in-browser warning under jsdom
  });

  it("checks for a user with the secret key, passing a challenge through", async () => {
    server.on("POST", `/v1/auth/${APP_ID}/authz/check`, { body: allow });

    await admin().authzCheck({ userId: "u1", action: "delete", resource: "invoice:9", challenge: "ch_1" });

    const [call] = server.calls;
    expect(call.headers["authorization"]).toBe("Bearer sk_test");
    expect(call.body).toEqual({ user_id: "u1", action: "delete", resource: "invoice:9", challenge: "ch_1" });
  });

  it("maps userId in batches", async () => {
    server.on("POST", `/v1/auth/${APP_ID}/authz/check-batch`, { body: { results: [allow] } });

    await admin().authzCheckBatch([{ userId: "u1", action: "read", resource: "document" }]);

    expect(server.calls[0].body).toEqual({ checks: [{ user_id: "u1", action: "read", resource: "document" }] });
  });

  it("asks for a data filter", async () => {
    server.on("POST", `/v1/auth/${APP_ID}/authz/filter`, { body: { permission: "document:read", filter: "all" } });

    const { data } = await admin().authzFilter({ userId: "u1", action: "read", resourceType: "document" });

    expect(data?.filter).toBe("all");
    expect(server.calls[0].body).toEqual({ user_id: "u1", action: "read", resource_type: "document" });
  });

  it("starts a step-up challenge bound to the permission", async () => {
    server.on("POST", `/v1/auth/${APP_ID}/challenges`, {
      status: 201,
      body: { challenge: { token: "ch_1", status: "pending", method: "entra_push", expires_at: "2030-01-01T00:00:00Z" } },
    });
    const decision = {
      ...allow,
      decision: "allow_with_step_up" as const,
      allowed: true,
      permission: "invoice:delete",
      step_up: { method: "entra_push", authorizes_action: "invoice:delete" },
    };

    const { data } = await admin().authzStartStepUp({ userId: "u1", decision });

    expect(data?.challenge.token).toBe("ch_1");
    expect(server.calls[0].body).toEqual({
      purpose: "step_up",
      method: "entra_push",
      app_user_id: "u1",
      metadata: { authorizes_action: "invoice:delete" },
    });
  });

  it("passes an approval through and manages requests", async () => {
    server.on("POST", `/v1/auth/${APP_ID}/authz/check`, { body: allow });
    server.on("POST", `/v1/apps/${APP_ID}/authz/requests`, { status: 201, body: { id: "req_1", status: "pending" } });
    server.on("POST", `/v1/apps/${APP_ID}/authz/requests/req_1/approve`, { body: { id: "req_1", status: "approved" } });

    await admin().authzCheck({ userId: "u1", action: "pay", resource: "invoice:9", approval: "req_1" });
    await admin().authzCreateRequest("u1", { role: "auditor", duration: 3600 });
    await admin().authzDecideRequest("req_1", "approve", { reviewerId: "u2", note: "ok" });

    expect(server.calls[0].body).toMatchObject({ approval: "req_1" });
    expect(server.calls[1].body).toEqual({ user_id: "u1", role: "auditor", duration: 3600 });
    expect(server.calls[2].body).toEqual({ reviewer_id: "u2", note: "ok" });
  });

  it("needs a method when the decision allows any", async () => {
    const decision = {
      ...allow,
      decision: "allow_with_step_up" as const,
      step_up: { method: "any", authorizes_action: "invoice:delete" },
    };

    await expect(admin().authzStartStepUp({ userId: "u1", decision: decision as any })).rejects.toThrow(/method/);
  });
});
