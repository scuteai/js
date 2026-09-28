/** ScuteElementsApi: request shapes with an element token. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScuteElementsApi from "../ScuteElementsApi";
import { APP_ID, BASE_URL, createServer, type TestServer } from "./harness";

let server: TestServer;
const base = `/v1/auth/${APP_ID}/authz/elements`;
const api = () => new ScuteElementsApi({ appId: APP_ID, baseUrl: BASE_URL, token: "sce_token" });

beforeEach(() => {
  server = createServer({ appData: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ScuteElementsApi", () => {
  it("sends the element token, never an Authorization header", async () => {
    server.on("GET", `${base}/users`, { body: { total: 0, users: [] } });

    await api().users({ q: "ada", limit: 20 });

    const [call] = server.calls;
    expect(call.headers["x-scute-element-token"]).toBe("sce_token");
    expect(call.headers["authorization"]).toBeUndefined();
    expect(call.query.get("q")).toBe("ada");
    expect(call.query.get("limit")).toBe("20");
  });

  it("assigns and revokes roles", async () => {
    server.on("POST", `${base}/users/u1/roles`, { status: 201, body: { role: "auditor", source: "manual", expires_at: null } });
    server.on("DELETE", `${base}/users/u1/roles/auditor`, { status: 204 });

    await api().assignRole("u1", "auditor", "2030-01-01T00:00:00Z");
    const { error } = await api().revokeRole("u1", "auditor");

    expect(server.calls[0].body).toEqual({ role: "auditor", expires_at: "2030-01-01T00:00:00Z" });
    expect(error).toBeNull();
  });

  it("reviews requests and pages decisions", async () => {
    server.on("GET", `${base}/requests`, { body: { requests: [{ id: "r1", kind: "role", status: "pending" }] } });
    server.on("POST", `${base}/requests/r1/approve`, { body: { id: "r1", status: "approved" } });
    server.on("GET", `${base}/decisions`, { body: { decisions: [], next: "d9" } });

    const { data: requests } = await api().requests();
    await api().approve("r1", "ok");
    await api().decisions({ userId: "u1", before: "d5" });

    expect(requests?.[0].id).toBe("r1");
    expect(server.calls[0].query.get("status")).toBe("pending");
    expect(server.calls[1].body).toEqual({ note: "ok" });
    expect(server.calls[2].query.get("user_id")).toBe("u1");
    expect(server.calls[2].query.get("before")).toBe("d5");
  });
});
