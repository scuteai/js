import { describe, it, expect } from "vitest";
import { MemorySink, FetchLike } from "../index";
import { buildGuard, buildGuardedTools, createOrderDb } from "../../examples/livekit-support-agent";

/**
 * Stateful mock of the Scute RBAC endpoints, so we can drive the LiveKit example
 * through the full 7-step demo without LiveKit OR a running Scute. Flipping the
 * flags mimics dashboard edits (grant permission / attach challenge) + the
 * caller completing verification.
 */
function statefulScute() {
  const state = { hasRefund: false, gated: false, verified: false };
  const fetchImpl: FetchLike = async (url, init) => {
    if (url.endsWith("/permissions")) {
      const permissions = ["orders:read"];
      if (state.hasRefund) permissions.push("orders:refund");
      return { ok: true, status: 200, json: async () => ({ m2m: false, user_id: "u1", roles: ["support"], permissions }) };
    }
    if (url.endsWith("/authorize")) {
      const perm = JSON.parse((init && init.body) || "{}").permission;
      const has = perm === "orders:read" || (perm === "orders:refund" && state.hasRefund);
      if (!has) return { ok: false, status: 403, json: async () => ({ allowed: false }) };
      if (perm === "orders:refund" && state.gated && !state.verified) {
        return { ok: false, status: 403, json: async () => ({ allowed: false, requires_verification: true, verification_method: "totp" }) };
      }
      return { ok: true, status: 200, json: async () => ({ allowed: true, requires_verification: state.gated, verification_method: state.gated ? "totp" : undefined }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { state, fetchImpl };
}

describe("LiveKit example: full 7-step demo against (mock) Scute", () => {
  it("blocked -> grant -> allowed -> attach challenge -> verify -> allowed, + arg cap", async () => {
    const { state, fetchImpl } = statefulScute();
    const sink = new MemorySink();
    const guard = buildGuard({ scuteBaseUrl: "https://api.scute.io", appId: "app_x", fetchImpl, sink });
    const db = createOrderDb();
    // LiveKit participant identity from token attributes
    const { lookupOrder, refundOrder } = buildGuardedTools(
      guard,
      { scute_user_id: "u1", scute_roles: "support", scute_kind: "user", scute_token: "tok" },
      db
    );

    // 1. read is allowed
    expect((await lookupOrder({ id: 4471 })).decision).toBe("allowed");

    // 2. refund blocked (role lacks orders:refund)
    expect((await refundOrder({ id: 4471 })).decision).toBe("blocked_rbac");
    expect(db[4471].status).toBe("paid");

    // 3. [dashboard] grant orders:refund -> allowed
    state.hasRefund = true;
    expect((await refundOrder({ id: 4471 })).decision).toBe("allowed");
    expect(db[4471].status).toBe("refunded");

    // arg-cap rung: a refund over $500 is blocked by policy even when allowed by RBAC
    db[4471].status = "paid";
    const overCap = await refundOrder({ id: 4471, amount: 5000 });
    expect(overCap.decision).toBe("blocked_policy");
    expect(db[4471].status).toBe("paid");

    // 4. [dashboard] attach challenge -> needs verification
    state.gated = true;
    const challenged = await refundOrder({ id: 4471 });
    expect(challenged.decision).toBe("needs_challenge");
    expect(challenged.message).toContain("verify");

    // 5. [caller] completes the challenge -> allowed
    state.verified = true;
    expect((await refundOrder({ id: 4471 })).decision).toBe("allowed");

    // observability: a span was recorded for each step (incl. the blocks)
    const decisions = sink.spans.filter((s) => s.type === "tool").map((s) => s.decision);
    expect(decisions).toContain("blocked_rbac");
    expect(decisions).toContain("blocked_policy");
    expect(decisions).toContain("needs_challenge");
    expect(decisions.filter((d) => d === "allowed").length).toBeGreaterThanOrEqual(2);
  });
});
