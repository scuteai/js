import { describe, it, expect } from "vitest";
import { AgentGuard, StubVerifier, MemorySink, StubConfig } from "../index";

const cfg: StubConfig = {
  identities: { "tok-member": { kind: "user", id: "u1", roles: ["member"] } },
  rolePermissions: { support: ["orders:refund"] },
};

describe("trace sink", () => {
  it("records a span for a blocked decision with full context", async () => {
    const sink = new MemorySink();
    const guard = new AgentGuard({ verifier: new StubVerifier(cfg), sink });
    await guard.run({
      actor: "tok-member",
      action: "refund_order",
      permission: "orders:refund",
    });

    expect(sink.spans).toHaveLength(1);
    const span = sink.spans[0];
    expect(span.decision).toBe("blocked_rbac");
    expect(span.action).toBe("refund_order");
    expect(span.requiredPermission).toBe("orders:refund");
    expect(span.identity).toMatchObject({ kind: "user", id: "u1", roles: ["member"] });
    expect(typeof span.durationMs).toBe("number");
  });

  it("records a span for an allowed decision with the result", async () => {
    const sink = new MemorySink();
    const guard = new AgentGuard({
      verifier: new StubVerifier({
        identities: { tok: { kind: "user", id: "u2", roles: ["support"] } },
        rolePermissions: { support: ["orders:refund"] },
      }),
      sink,
    });
    const refund = guard.tool({
      name: "refund_order",
      permission: "orders:refund",
      run: async () => "refunded",
    });
    await refund({ orderId: 1 }, { actor: "tok" });

    expect(sink.spans[0].decision).toBe("allowed");
    expect(sink.spans[0].result).toBe("refunded");
  });
});
