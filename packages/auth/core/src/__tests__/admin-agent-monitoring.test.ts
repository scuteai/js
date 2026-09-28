/**
 * Agent monitoring from your backend (RB-45): the review inbox, the evidence
 * report, checking the decision log, and the kill switch for every agent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScuteAdminApi from "../ScuteAdminApi";
import { APP_ID, BASE_URL, createServer, type TestServer } from "./harness";

let server: TestServer;
const base = `/v1/apps/${APP_ID}/authz`;
const admin = () => new ScuteAdminApi({ appId: APP_ID, baseUrl: BASE_URL, secretKey: "sk_test" });

beforeEach(() => {
  server = createServer({ appData: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("agent monitoring, from your backend", () => {
  it("lists the inbox with filters and reviews an item", async () => {
    server.on("GET", `${base}/agents/monitor`, {
      body: { items: [{ id: "i1", kind: "loop", agent: "support-bot", status: "open", created_at: "2026-09-28T00:00:00Z" }],
              counts: { open: 1, acknowledged: 0, flagged: 0 } },
    });
    server.on("POST", `${base}/agents/monitor/i1/review`, { body: { id: "i1", kind: "loop", agent: "support-bot", status: "flagged" } });

    const { data } = await admin().agentMonitor({ status: "all", kind: "loop", agent: "support-bot" });
    expect(data?.items[0].kind).toBe("loop");
    expect(data?.counts.open).toBe(1);
    const query = server.callsTo("GET", `${base}/agents/monitor`)[0].query;
    expect([query.get("status"), query.get("kind"), query.get("agent")]).toEqual(["all", "loop", "support-bot"]);

    const { data: item } = await admin().reviewAgentMonitorItem("i1", { status: "flagged", note: "Retry storm" });
    expect(item?.status).toBe("flagged");
    const [call] = server.callsTo("POST", `${base}/agents/monitor/i1/review`);
    expect(call.headers["authorization"]).toBe("Bearer sk_test");
    expect(call.body).toEqual({ status: "flagged", note: "Retry storm" });
  });

  it("reads the evidence report for a period and checks the decision log", async () => {
    const from = "2026-09-01T00:00:00.000Z";
    const to = "2026-09-28T00:00:00.000Z";
    server.on("GET", `${base}/agents/support-bot/report`, {
      body: { period: { from, to }, decisions: { total: 3 }, log: { ok: true, checked: 3 } },
    });
    server.on("GET", `${base}/decisions/verify`, { body: { ok: false, checked: 1, first_break: { id: "d2", seq: 2, at: to, reason: "changed" } } });

    const { data: report } = await admin().agentReport("support-bot", { from, to: new Date(to) });
    expect(report?.log.ok).toBe(true);
    const query = server.callsTo("GET", `${base}/agents/support-bot/report`)[0].query;
    expect([query.get("from"), query.get("to")]).toEqual([from, to]);

    const { data: check } = await admin().verifyDecisionLog();
    expect(check?.first_break?.reason).toBe("changed");
  });

  it("stops every agent with a reason", async () => {
    server.on("POST", `${base}/agents/suspend_all`, { body: { suspended: ["a", "b"], tasks_revoked: 2 } });
    const { data } = await admin().suspendAllAgents("Incident 42");
    expect(data?.suspended).toEqual(["a", "b"]);
    expect(server.callsTo("POST", `${base}/agents/suspend_all`)[0].body).toEqual({ reason: "Incident 42" });
  });
});
