import { describe, it, expect } from "vitest";
import {
  AgentGuard,
  StubVerifier,
  MemorySink,
  StubConfig,
  maxAmount,
  argAllowlist,
  velocity,
  MemoryVelocityStore,
} from "../index";

const cfg: StubConfig = {
  identities: { tok: { kind: "user", id: "u1", roles: ["support"] } },
  rolePermissions: { support: ["orders:refund"] },
};

function makeGuard() {
  const sink = new MemorySink();
  const guard = new AgentGuard({ verifier: new StubVerifier(cfg), sink });
  return { guard, sink };
}

describe("guardrail ladder (layers)", () => {
  it("args rung: blocks an amount over the cap with a reason", async () => {
    const { guard } = makeGuard();
    let ran = false;
    const refund = guard.tool({
      name: "refund_order",
      permission: "orders:refund",
      layers: [maxAmount("amount", 500)],
      run: async () => { ran = true; return "ok"; },
    });

    const under = await refund({ amount: 120 }, { actor: "tok" });
    expect(under.decision).toBe("allowed");

    const over = await refund({ amount: 5000 }, { actor: "tok" });
    expect(over.decision).toBe("blocked_policy");
    expect(over.span.error).toContain("exceeds limit 500");
    expect(ran).toBe(true); // ran once (the allowed one), not for the blocked one
  });

  it("args rung runs only after RBAC passes (no permission -> blocked_rbac, not policy)", async () => {
    const { guard } = makeGuard();
    const refund = guard.tool({
      name: "refund_order",
      permission: "orders:refund",
      layers: [maxAmount("amount", 500)],
      run: async () => "ok",
    });
    const res = await refund({ amount: 5000 }, { actor: { kind: "user", id: "x", roles: ["member"] } });
    expect(res.decision).toBe("blocked_rbac");
  });

  it("allowlist rung blocks a disallowed value", async () => {
    const { guard } = makeGuard();
    const transfer = guard.tool({
      name: "refund_order",
      permission: "orders:refund",
      layers: [argAllowlist("to", ["savings", "checking"])],
      run: async () => "ok",
    });
    expect((await transfer({ to: "savings" }, { actor: "tok" })).decision).toBe("allowed");
    const bad = await transfer({ to: "offshore" }, { actor: "tok" });
    expect(bad.decision).toBe("blocked_policy");
    expect(bad.span.error).toContain("not allowed");
  });

  it("velocity rung: allows up to max per window, then blocks", async () => {
    const { guard } = makeGuard();
    let t = 1000;
    const store = new MemoryVelocityStore(() => t);
    const refund = guard.tool({
      name: "refund_order",
      permission: "orders:refund",
      layers: [velocity({ max: 2, windowMs: 60000, store })],
      run: async () => "ok",
    });

    expect((await refund({}, { actor: "tok" })).decision).toBe("allowed");
    expect((await refund({}, { actor: "tok" })).decision).toBe("allowed");
    expect((await refund({}, { actor: "tok" })).decision).toBe("blocked_policy"); // 3rd in window

    t += 61000; // window elapses
    expect((await refund({}, { actor: "tok" })).decision).toBe("allowed");
  });
});
