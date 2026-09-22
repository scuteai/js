import { describe, it, expect } from "vitest";
import { AgentGuard, StubVerifier, MemorySink, StubConfig } from "../index";

function makeGuard(cfg: StubConfig, failClosed = true) {
  const sink = new MemorySink();
  let n = 0;
  const guard = new AgentGuard({
    verifier: new StubVerifier(cfg),
    sink,
    failClosed,
    now: () => 1000,
    genId: () => `t${n++}`,
  });
  return { guard, sink };
}

const cfg: StubConfig = {
  identities: {
    "tok-support": { kind: "user", id: "u-support", roles: ["support"] },
    "tok-member": { kind: "user", id: "u-member", roles: ["member"] },
    "tok-agent": { kind: "m2m", id: "m2m-1", roles: ["support_bot"] },
  },
  rolePermissions: {
    support: ["orders:read", "orders:refund"],
    member: ["orders:read"],
    support_bot: ["orders:read", "orders:refund"],
  },
};

describe("policy gate", () => {
  it("allows when the role has the permission", async () => {
    const { guard } = makeGuard(cfg);
    const res = await guard.run({
      actor: "tok-support",
      action: "refund_order",
      permission: "orders:refund",
    });
    expect(res.decision).toBe("allowed");
    expect(res.allowed).toBe(true);
  });

  it("blocks (rbac) when the role lacks the permission", async () => {
    const { guard } = makeGuard(cfg);
    const res = await guard.run({
      actor: "tok-member",
      action: "refund_order",
      permission: "orders:refund",
    });
    expect(res.decision).toBe("blocked_rbac");
    expect(res.allowed).toBe(false);
  });

  it("fails closed for an action with no required permission", async () => {
    const { guard } = makeGuard(cfg);
    const res = await guard.run({ actor: "tok-support", action: "mystery" });
    expect(res.decision).toBe("blocked_no_rule");
  });

  it("allows an unruled action when failClosed is off", async () => {
    const { guard } = makeGuard(cfg, false);
    const res = await guard.run({ actor: "tok-support", action: "mystery" });
    expect(res.decision).toBe("allowed");
  });

  it("denies an unknown/anonymous token", async () => {
    const { guard } = makeGuard(cfg);
    const res = await guard.run({
      actor: "tok-unknown",
      action: "refund_order",
      permission: "orders:refund",
    });
    expect(res.decision).toBe("blocked_rbac");
    expect(res.span.identity.kind).toBe("anonymous");
  });
});

describe("verification gate", () => {
  const vcfg: StubConfig = {
    ...cfg,
    verification: { "orders:refund": { method: "otp" } },
  };

  it("requires a challenge for an unverified user", async () => {
    const { guard } = makeGuard(vcfg);
    const res = await guard.run({
      actor: "tok-support",
      action: "refund_order",
      permission: "orders:refund",
    });
    expect(res.decision).toBe("needs_challenge");
    expect(res.challenge?.method).toBe("otp");
  });

  it("allows once the user is verified", async () => {
    const { guard } = makeGuard({
      ...vcfg,
      verified: new Set(["u-support:orders:refund"]),
    });
    const res = await guard.run({
      actor: "tok-support",
      action: "refund_order",
      permission: "orders:refund",
    });
    expect(res.decision).toBe("allowed");
  });

  it("escalates M2M to approval instead of a challenge", async () => {
    const { guard } = makeGuard(vcfg);
    const res = await guard.run({
      actor: "tok-agent",
      action: "refund_order",
      permission: "orders:refund",
    });
    expect(res.decision).toBe("approval_required");
  });
});
