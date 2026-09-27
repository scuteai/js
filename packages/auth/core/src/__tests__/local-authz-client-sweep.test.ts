/**
 * Bug sweep: ScuteLocalAuthz answers "allow" from a `not exists` condition
 * without asking the API, while the API (which has the object's stored
 * attributes) denies.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScuteAdminApi from "../ScuteAdminApi";
import ScuteLocalAuthz from "../ScuteLocalAuthz";
import { APP_ID, BASE_URL, createServer, type TestServer } from "./harness";

let server: TestServer;
const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

beforeEach(() => {
  server = createServer({ appData: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const policy = {
    permissions: { "document:edit": { enabled: true } },
    roles: {
      editor: {
        permissions: ["document:edit"],
        conditions: { "document:edit": { not: { exists: { var: "resource.locked_by" } } } },
      },
    },
    resources: { document: { roles: {}, relations: {}, derivations: [] } },
  };
  server.on("GET", `/v1/apps/${APP_ID}/authz/snapshot`, {
    body: { version: 1, token: `${enc({ alg: "RS256" })}.${enc({ typ: "scute-authz-snapshot", aud: APP_ID, exp: 9e9, version: 1, policy })}.sig` },
  });
  server.on("GET", `/v1/auth/${APP_ID}/authz/users/u1/permissions`, { body: { user_id: "u1", roles: ["editor"], permissions: [], step_up: [] } });
  // The API has document 42's stored attributes (locked_by: "u9"), so its condition fails.
  server.on("POST", `/v1/auth/${APP_ID}/authz/check`, { body: { decision: "deny", allowed: false, reason: "condition_failed" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ScuteLocalAuthz (non-strict, the default)", () => {
  it("asks the API when a condition reads an attribute the caller didn't pass", async () => {
    const authz = new ScuteLocalAuthz(new ScuteAdminApi({ appId: APP_ID, baseUrl: BASE_URL, secretKey: "sk" }));

    const d = await authz.check({ userId: "u1", action: "edit", resource: "document:42" });

    expect({ decision: d?.decision, serverChecks: server.callsTo("POST", `/v1/auth/${APP_ID}/authz/check`).length }).toEqual({
      decision: "deny",
      serverChecks: 1,
    });
  });
});
