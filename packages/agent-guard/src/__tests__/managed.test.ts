import { describe, it, expect } from "vitest";
import { loadAgentConfig, callManagedTool, FetchLike } from "../index";

function mockFetch(handlers: {
  config?: any;
  guard?: (perm: any) => { status: number; decision: string; result?: any; error?: string };
}): FetchLike {
  return async (url, init) => {
    if (url.endsWith("/config")) {
      if (!handlers.config) return { ok: false, status: 403, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => handlers.config };
    }
    if (url.endsWith("/guard")) {
      const body = JSON.parse((init && init.body) || "{}");
      const d = handlers.guard!(body);
      return { ok: d.status < 400, status: d.status, json: async () => d };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

const opts = { baseUrl: "https://api.scute.io", appId: "app_x", agentId: "ag1", token: "m2m-tok" };

describe("managed worker client (M03)", () => {
  it("loads agent config", async () => {
    const config = { id: "ag1", name: "support", model: "claude-opus-4-8", capabilities: ["read_orders"], tools: [{ name: "refund_order", json_schema: {}, required_permission: "orders:refund" }], guard_url: "/v1/auth/app_x/agents/ag1/guard" };
    const cfg = await loadAgentConfig({ ...opts, fetchImpl: mockFetch({ config }) });
    expect(cfg).toMatchObject({ name: "support", capabilities: ["read_orders"] });
    expect(cfg?.tools[0].name).toBe("refund_order");
  });

  it("returns null when config is forbidden", async () => {
    const cfg = await loadAgentConfig({ ...opts, fetchImpl: mockFetch({}) });
    expect(cfg).toBeNull();
  });

  it("routes a tool through the hosted guard: allowed", async () => {
    const f = mockFetch({ guard: () => ({ status: 200, decision: "allowed", result: { status: "refunded" } }) });
    const r = await callManagedTool({ ...opts, fetchImpl: f }, "refund_order", { id: 1 });
    expect(r).toMatchObject({ ok: true, decision: "allowed", output: { status: "refunded" } });
  });

  it("routes a tool through the hosted guard: blocked", async () => {
    const f = mockFetch({ guard: () => ({ status: 403, decision: "blocked_rbac" }) });
    const r = await callManagedTool({ ...opts, fetchImpl: f }, "refund_order", { id: 1 });
    expect(r).toMatchObject({ ok: false, decision: "blocked_rbac" });
  });
});
