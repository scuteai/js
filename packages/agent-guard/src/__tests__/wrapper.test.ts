import { describe, it, expect } from "vitest";
import { AgentGuard, StubVerifier, MemorySink, StubConfig } from "../index";

const cfg: StubConfig = {
  identities: {
    "tok-member": { kind: "user", id: "u-member", roles: ["member"] },
    "tok-support": { kind: "user", id: "u-support", roles: ["support"] },
  },
  rolePermissions: { support: ["orders:refund"] },
};

/** A scripted model: emits predetermined tool calls, no LLM. */
function scriptedAgent(guard: AgentGuard, actor: string) {
  const refund = guard.tool({
    name: "refund_order",
    permission: "orders:refund",
    run: async (args: { orderId: number }) => `refunded ${args.orderId}`,
  });
  return {
    refund,
    // simulate the model deciding to call refund
    async ask(orderId: number) {
      return refund({ orderId }, { actor });
    },
  };
}

describe("agent wrapper", () => {
  it("blocked tool never executes", async () => {
    const sink = new MemorySink();
    const guard = new AgentGuard({ verifier: new StubVerifier(cfg), sink });
    let ran = false;
    const refund = guard.tool({
      name: "refund_order",
      permission: "orders:refund",
      run: async () => {
        ran = true;
        return "done";
      },
    });
    const res = await refund({ orderId: 1 }, { actor: "tok-member" });
    expect(res.decision).toBe("blocked_rbac");
    expect(ran).toBe(false);
  });

  it("allowed tool executes and returns its result", async () => {
    const sink = new MemorySink();
    const guard = new AgentGuard({ verifier: new StubVerifier(cfg), sink });
    const agent = scriptedAgent(guard, "tok-support");
    const res = await agent.ask(4471);
    expect(res.decision).toBe("allowed");
    expect(res.result).toBe("refunded 4471");
    expect(sink.spans[0].decision).toBe("allowed");
  });

  it("records downstream tool failure distinctly from a block", async () => {
    const sink = new MemorySink();
    const guard = new AgentGuard({ verifier: new StubVerifier(cfg), sink });
    const refund = guard.tool({
      name: "refund_order",
      permission: "orders:refund",
      run: async () => {
        throw new Error("db down");
      },
    });
    const res = await refund({ orderId: 1 }, { actor: "tok-support" });
    expect(res.decision).toBe("allowed_downstream_error");
    expect(res.allowed).toBe(true);
    expect(sink.spans[0].error).toContain("db down");
  });
});
