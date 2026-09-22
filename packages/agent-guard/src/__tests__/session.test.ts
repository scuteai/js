import { describe, it, expect } from "vitest";
import { AgentGuard, StubVerifier, MemorySink, StubConfig } from "../index";

const cfg: StubConfig = {
  identities: { tok: { kind: "user", id: "u1", roles: ["support"] } },
  rolePermissions: { support: ["orders:refund"] },
};

function makeGuard() {
  const sink = new MemorySink();
  let n = 0;
  const guard = new AgentGuard({
    verifier: new StubVerifier(cfg),
    sink,
    now: () => 1000,
    genId: () => `id${n++}`,
  });
  return { guard, sink };
}

describe("session hierarchy", () => {
  it("groups tool / generation / score spans under one session", async () => {
    const { guard, sink } = makeGuard();
    const s = guard.session({ actor: "tok", replaySessionId: "replay-123" });

    await s.run("refund_order", { orderId: 1 }, "orders:refund");
    await s.recordGeneration({
      model: "claude-opus-4-8",
      inputTokens: 120,
      outputTokens: 35,
      costUsd: 0.004,
    });
    await s.recordScore({ name: "sentiment", value: 0.9 });
    await s.recordFeedback(1, "great help");

    expect(sink.spans).toHaveLength(4);
    // all share the same session
    expect(new Set(sink.spans.map((x) => x.sessionId))).toEqual(
      new Set([s.sessionId])
    );
    // all share the same trace (one turn)
    expect(new Set(sink.spans.map((x) => x.traceId)).size).toBe(1);

    const byType = (t: string) => sink.spans.find((x) => x.type === t);
    expect(byType("tool")?.decision).toBe("allowed");
    expect(byType("generation")?.costUsd).toBe(0.004);
    expect(byType("generation")?.outputTokens).toBe(35);

    const scores = sink.spans.filter((x) => x.type === "score");
    expect(scores.find((x) => x.scoreName === "sentiment")?.score).toBe(0.9);
    const fb = scores.find((x) => x.scoreName === "user_feedback");
    expect(fb?.source).toBe("user");
    expect(fb?.comment).toBe("great help");
  });

  it("starts a new trace per turn but keeps the session", async () => {
    const { guard, sink } = makeGuard();
    const s = guard.session({ actor: "tok" });
    await s.run("refund_order", {}, "orders:refund");
    const firstTrace = sink.spans[0].traceId;
    s.newTurn();
    await s.run("refund_order", {}, "orders:refund");
    const secondTrace = sink.spans[1].traceId;

    expect(firstTrace).not.toBe(secondTrace);
    expect(sink.spans[0].sessionId).toBe(sink.spans[1].sessionId);
  });

  it("records an error span via traced() on failure", async () => {
    const { guard, sink } = makeGuard();
    const s = guard.session({ actor: "tok" });
    await expect(
      s.traced("retrieval", async () => {
        throw new Error("vector db timeout");
      })
    ).rejects.toThrow("vector db timeout");

    const err = sink.spans.find((x) => x.type === "error");
    expect(err?.error).toContain("vector db timeout");
    expect(err?.sessionId).toBe(s.sessionId);
  });
});
