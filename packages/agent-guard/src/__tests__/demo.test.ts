import { describe, it, expect } from "vitest";
import { AgentGuard, StubVerifier, MemorySink } from "../index";

/**
 * Runnable end-to-end demo of the full product loop, with a mock-backed
 * verifier standing in for Scute RBAC (#18). This is what the LiveKit/Twilio
 * examples (A10-A12) will do for real once #18 ships. Watch the narrated
 * timeline with:  pnpm --filter @scute/agent-guard test
 */
describe("seven-step demo (mock RBAC)", () => {
  it("blocked -> grant -> allowed -> attach challenge -> verify -> allowed, all traced", async () => {
    const log = (s: string) => console.log(s);

    // --- fake customer-hosted order DB + tools ---------------------------
    const db: Record<number, { status: string; amount: number }> = {
      4471: { status: "paid", amount: 120 },
    };

    // support user starts with read-only
    const verifier = new StubVerifier({
      identities: {
        "tok-support": { kind: "user", id: "u-support", roles: ["support"] },
      },
      rolePermissions: { support: ["orders:read"] },
    });

    const sink = new MemorySink();
    const guard = new AgentGuard({ verifier, sink });

    guard.tool({
      name: "lookup_order",
      permission: "orders:read",
      run: (a: { id: number }) => db[a.id],
    });
    guard.tool({
      name: "refund_order",
      permission: "orders:refund",
      run: (a: { id: number }) => {
        db[a.id].status = "refunded";
        return { id: a.id, status: "refunded" };
      },
    });

    const s = guard.session({
      actor: "tok-support",
      replaySessionId: "replay-abc",
    });

    log("\n=== Agent Guard demo: support agent, order #4471 ===");

    // STEP 1: read is allowed
    const r1 = await s.run("lookup_order", { id: 4471 }, "orders:read");
    log(`1. lookup_order        -> ${r1.decision}`);
    expect(r1.decision).toBe("allowed");

    // STEP 2: refund blocked (role lacks orders:refund)
    const r2 = await s.run("refund_order", { id: 4471 }, "orders:refund");
    log(`2. refund_order        -> ${r2.decision}   (db: ${db[4471].status})`);
    expect(r2.decision).toBe("blocked_rbac");
    expect(db[4471].status).toBe("paid"); // never ran

    // STEP 3: "dashboard" grants the permission -> retry allowed
    verifier.grant("support", "orders:refund");
    log("   [dashboard] granted support -> orders:refund");
    const r3 = await s.run("refund_order", { id: 4471 }, "orders:refund");
    log(`3. refund_order        -> ${r3.decision}   (db: ${db[4471].status})`);
    expect(r3.decision).toBe("allowed");
    expect(db[4471].status).toBe("refunded");

    // reset for the challenge demo
    db[4471].status = "paid";

    // STEP 4: "dashboard" attaches a challenge -> retry needs verification
    verifier.requireVerification("orders:refund", "otp");
    log("   [dashboard] orders:refund now requires OTP");
    const r4 = await s.run("refund_order", { id: 4471 }, "orders:refund");
    log(`4. refund_order        -> ${r4.decision} (${r4.challenge?.method})`);
    expect(r4.decision).toBe("needs_challenge");
    expect(db[4471].status).toBe("paid"); // still blocked

    // STEP 5: user completes the challenge -> retry allowed
    verifier.markVerified("u-support", "orders:refund");
    log("   [caller] completed OTP challenge");
    const r5 = await s.run("refund_order", { id: 4471 }, "orders:refund");
    log(`5. refund_order        -> ${r5.decision}   (db: ${db[4471].status})`);
    expect(r5.decision).toBe("allowed");

    // --- observability: generation, sentiment, feedback ------------------
    await s.recordGeneration({
      model: "claude-opus-4-8",
      inputTokens: 210,
      outputTokens: 48,
      costUsd: 0.0061,
    });
    await s.recordScore({ name: "sentiment", value: 0.86 });
    await s.recordFeedback(1, "sorted my refund fast");

    // --- session timeline + mini stats -----------------------------------
    log("\n--- session timeline ---");
    for (const sp of sink.spans) {
      const extra =
        sp.type === "generation"
          ? ` ${sp.model} ${(sp.inputTokens ?? 0) + (sp.outputTokens ?? 0)}tok $${sp.costUsd}`
          : sp.type === "score"
          ? ` ${sp.scoreName}=${sp.score}${sp.source === "user" ? " (user)" : ""}`
          : ` ${sp.decision}`;
      log(`  [${sp.type}] ${sp.action}${extra}`);
    }

    const blocked = sink.spans.filter((x) =>
      x.decision.startsWith("blocked")
    ).length;
    const cost = sink.spans.reduce((n, x) => n + (x.costUsd || 0), 0);
    const sentiment = sink.spans.find((x) => x.scoreName === "sentiment")?.score;
    log(
      `\n--- stats ---  spans=${sink.spans.length} blocked=${blocked} cost=$${cost.toFixed(
        4
      )} sentiment=${sentiment}`
    );

    // everything is in one session, replay link intact
    expect(s.replaySessionId).toBe("replay-abc");
    expect(new Set(sink.spans.map((x) => x.sessionId))).toEqual(
      new Set([s.sessionId])
    );
    expect(blocked).toBe(1);
  });
});
