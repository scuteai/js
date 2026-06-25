import { describe, it, expect } from "vitest";
import {
  AgentGuard,
  StubVerifier,
  MemorySink,
  StubConfig,
  handleToolCall,
  toToolResponse,
  identityFromLiveKitAttributes,
  guardedLiveKitTool,
} from "../index";

const cfg: StubConfig = {
  identities: { "tok-support": { kind: "user", id: "u1", roles: ["support"] } },
  rolePermissions: { support: ["orders:refund"] },
};

function makeGuard(extra?: Partial<StubConfig>) {
  const sink = new MemorySink();
  const guard = new AgentGuard({ verifier: new StubVerifier({ ...cfg, ...extra }), sink });
  return { guard, sink };
}

describe("webhook adapter: handleToolCall + toToolResponse", () => {
  it("uses the call binding for identity (verify_caller flow)", async () => {
    const { guard } = makeGuard();
    let ran = false;
    guard.tool({ name: "refund_order", permission: "orders:refund", run: async () => { ran = true; return "ok"; } });

    // anonymous before binding -> blocked
    const before = await handleToolCall(guard, { toolName: "refund_order", args: { id: 1 }, callId: "call-1" });
    expect(before.decision).toBe("blocked_rbac");
    expect(ran).toBe(false);
    expect(toToolResponse(before)).toMatchObject({ ok: false, decision: "blocked_rbac" });

    // verify_caller binds the call to a real identity -> allowed
    guard.bindCall("call-1", { kind: "user", id: "u1", roles: ["support"] });
    const after = await handleToolCall(guard, { toolName: "refund_order", args: { id: 1 }, callId: "call-1" });
    expect(after.decision).toBe("allowed");
    expect(ran).toBe(true);
    expect(toToolResponse(after)).toMatchObject({ ok: true, output: "ok" });
  });

  it("threads callId/toolCallId into the trace as session/trace ids", async () => {
    const { guard, sink } = makeGuard();
    guard.tool({ name: "lookup", permission: "orders:read", run: () => "x" });
    guard.bindCall("call-9", { kind: "user", id: "u1", roles: ["support"] });
    await handleToolCall(guard, { toolName: "lookup", callId: "call-9", toolCallId: "tc-7" }, {});
    // support lacks orders:read here -> blocked, but the span still carries the ids
    const span = sink.spans[0];
    expect(span.sessionId).toBe("call-9");
    expect(span.traceId).toBe("tc-7");
  });

  it("maps each decision to a caller-facing message", () => {
    expect(toToolResponse({ decision: "needs_challenge", allowed: false, span: {} as any, challenge: { method: "otp" } }).message)
      .toContain("verify");
    expect(toToolResponse({ decision: "approval_required", allowed: false, span: {} as any }).message)
      .toContain("approval");
  });
});

describe("livekit adapter", () => {
  it("reads identity from participant token attributes", () => {
    expect(
      identityFromLiveKitAttributes({ scute_user_id: "u1", scute_roles: "support, manager", scute_kind: "user" })
    ).toEqual({ kind: "user", id: "u1", roles: ["support", "manager"] });

    expect(identityFromLiveKitAttributes(undefined)).toEqual({ kind: "anonymous", roles: [] });
    expect(identityFromLiveKitAttributes({ scute_user_id: "bot", scute_kind: "m2m" }).kind).toBe("m2m");
  });

  it("gates a function tool by the participant's identity", async () => {
    const { guard } = makeGuard();
    const identity = identityFromLiveKitAttributes({ scute_user_id: "u1", scute_roles: "support" });
    let ran = false;
    const refund = guardedLiveKitTool(guard, identity, {
      name: "refund_order",
      permission: "orders:refund",
      run: async () => { ran = true; return "refunded"; },
    });
    const res = await refund({ id: 1 });
    expect(res).toMatchObject({ ok: true, output: "refunded" });
    expect(ran).toBe(true);
  });
});
