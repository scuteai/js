/** Policy suggestions and backtests from your backend (RB-45). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScuteAdminApi from "../ScuteAdminApi";
import { APP_ID, BASE_URL, createServer, type TestServer } from "./harness";

let server: TestServer;
const base = `/v1/apps/${APP_ID}/authz/policy`;
const admin = () => new ScuteAdminApi({ appId: APP_ID, baseUrl: BASE_URL, secretKey: "sk_test" });

beforeEach(() => {
  server = createServer({ appData: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("policy suggestions and backtests", () => {
  it("lists suggestions for a period and backtests one's change", async () => {
    const change = [{ op: "revoke" as const, role: "clerk", permission: "invoice:refund" }];
    server.on("GET", `${base}/suggestions`, { body: { suggestions: [{ kind: "unused_grant", title: "t", evidence: {}, change }] } });
    server.on("POST", `${base}/backtest`, { body: { days: 7, checked: 5, changed: 1, summary: { "allow -> deny": 1 }, people_affected: 1, examples: [], allow_sample_rate: 1, note: "n" } });

    const { data: suggestions } = await admin().authzSuggestions(14);
    expect(suggestions?.[0].change).toEqual(change);
    expect(server.callsTo("GET", `${base}/suggestions`)[0].query.get("days")).toBe("14");

    const { data: result } = await admin().authzBacktest(change, { days: 7 });
    expect(result?.summary).toEqual({ "allow -> deny": 1 });
    const [call] = server.callsTo("POST", `${base}/backtest`);
    expect(call.headers["authorization"]).toBe("Bearer sk_test");
    expect(call.body).toEqual({ change, days: 7 });
  });
});
