import { describe, it, expect } from "vitest";
import { AgentGuard, StubVerifier, MemorySink } from "../index";
import {
  parseElevenLabsWebhook,
  parseVapiWebhook,
  parseTwilioWebhook,
  runPhoneTool,
  bindVerifiedCaller,
} from "../../examples/phone-agent";

describe("phone example: provider webhook parsing", () => {
  it("maps each provider's tool-call shape to a ToolCall", () => {
    expect(parseElevenLabsWebhook({ tool_name: "refund_order", parameters: { id: 1 }, conversation_id: "c1" }))
      .toMatchObject({ toolName: "refund_order", args: { id: 1 }, callId: "c1" });

    expect(parseVapiWebhook({ message: { toolCalls: [{ id: "t1", function: { name: "refund_order", arguments: '{"id":2}' } }] }, call: { id: "c2" } }))
      .toMatchObject({ toolName: "refund_order", args: { id: 2 }, callId: "c2", toolCallId: "t1" });

    expect(parseTwilioWebhook({ tool: "refund_order", args: { id: 3 }, CallSid: "CA123" }))
      .toMatchObject({ toolName: "refund_order", args: { id: 3 }, callId: "CA123" });
  });
});

describe("phone example: verify_caller then act", () => {
  it("anonymous caller is blocked until verified, then allowed", async () => {
    const verifier = new StubVerifier({ rolePermissions: { support: ["orders:refund"] } });
    const guard = new AgentGuard({ verifier, sink: new MemorySink() });
    let ran = false;
    guard.tool({
      name: "refund_order",
      permission: "orders:refund",
      run: async () => {
        ran = true;
        return { status: "refunded" };
      },
    });

    const call = parseElevenLabsWebhook({ tool_name: "refund_order", parameters: { id: 4471 }, conversation_id: "call-1" })!;

    // 1. anonymous (pre-verify) -> blocked, tool never runs
    const before = await runPhoneTool(guard, call);
    expect(before.decision).toBe("blocked_rbac");
    expect(before.ok).toBe(false);
    expect(ran).toBe(false);

    // 2. caller completes the OTP challenge -> bind identity to the call
    bindVerifiedCaller(guard, "call-1", { kind: "user", id: "u1", roles: ["support"] });

    // 3. retry -> allowed, scoped to the verified caller
    const after = await runPhoneTool(guard, call);
    expect(after.decision).toBe("allowed");
    expect(after.ok).toBe(true);
    expect(ran).toBe(true);
  });
});
