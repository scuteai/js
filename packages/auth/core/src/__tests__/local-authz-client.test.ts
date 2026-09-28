/** ScuteLocalAuthz: snapshot refresh, role cache, fallback to the API. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScuteAdminApi from "../ScuteAdminApi";
import ScuteLocalAuthz from "../ScuteLocalAuthz";
import { APP_ID, BASE_URL, createServer, type TestServer } from "./harness";

let server: TestServer;
const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const snapshot = (version: number, roles: Record<string, unknown>) => ({
  version,
  token: `${enc({ alg: "RS256" })}.${enc({ typ: "scute-authz-snapshot", aud: APP_ID, exp: 9e9, version, policy: {
    permissions: { "document:read": { enabled: true }, "document:edit": { enabled: true } },
    roles,
    resources: { document: { roles: { owner: { permissions: ["document:edit"] } } } },
  } })}.sig`,
});

beforeEach(() => {
  server = createServer({ appData: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  server.on("GET", `/v1/apps/${APP_ID}/authz/snapshot`, { body: snapshot(1, { reader: { permissions: ["document:read"] } }) });
  server.on("GET", `/v1/auth/${APP_ID}/authz/users/u1/permissions`, { body: { user_id: "u1", roles: ["reader"], permissions: [], step_up: [] } });
  server.on("POST", `/v1/auth/${APP_ID}/authz/check`, { body: { decision: "allow", allowed: true, reason: "resource_role" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const admin = () => new ScuteAdminApi({ appId: APP_ID, baseUrl: BASE_URL, secretKey: "sk" });

describe("ScuteLocalAuthz", () => {
  it("decides locally and caches roles", async () => {
    const authz = new ScuteLocalAuthz(admin());

    expect((await authz.check({ userId: "u1", action: "read", resource: "document" }))?.decision).toBe("allow");
    expect((await authz.check({ userId: "u1", action: "edit", resource: "document" }))?.decision).toBe("deny");

    expect(server.callsTo("GET", `/v1/apps/${APP_ID}/authz/snapshot`)).toHaveLength(1);
    expect(server.callsTo("GET", `/v1/auth/${APP_ID}/authz/users/u1/permissions`)).toHaveLength(1);
    expect(server.callsTo("POST", `/v1/auth/${APP_ID}/authz/check`)).toHaveLength(0);
    expect(authz.policyVersion).toBe(1);
  });

  it("asks the API about roles on one object", async () => {
    const authz = new ScuteLocalAuthz(admin());

    const d = await authz.check({ userId: "u1", action: "edit", resource: "document:42" });

    expect(d?.reason).toBe("resource_role");
    expect(server.callsTo("POST", `/v1/auth/${APP_ID}/authz/check`)[0].body).toMatchObject({ user_id: "u1", resource: "document:42" });
  });

  it("refreshes a stale snapshot in the background", async () => {
    const authz = new ScuteLocalAuthz(admin(), { refreshMs: 0 });
    await authz.check({ userId: "u1", action: "read", resource: "document" });
    server.on("GET", `/v1/apps/${APP_ID}/authz/snapshot`, { body: snapshot(2, { reader: { permissions: ["document:read", "document:edit"] } }) });

    await authz.check({ userId: "u1", action: "read", resource: "document" });
    await authz.refresh();

    expect(authz.policyVersion).toBe(2);
    expect((await authz.check({ userId: "u1", action: "edit", resource: "document" }))?.decision).toBe("allow");
  });
});
