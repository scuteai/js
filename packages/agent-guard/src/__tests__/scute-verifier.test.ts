import { describe, it, expect } from "vitest";
import { AgentGuard, ScuteVerifier, MemorySink, FetchLike } from "../index";

/**
 * Mock the two Scute endpoints. `perms` is what /permissions returns;
 * `decide(permission)` is what /authorize returns for a given slug.
 */
function mockFetch(opts: {
  perms: { m2m?: boolean; user_id?: string; roles?: string[]; permissions?: string[] };
  decide: (permission: string) => { status: number; allowed: boolean; requires_verification?: boolean; verification_method?: string };
}): FetchLike {
  return async (url, init) => {
    if (url.endsWith("/permissions")) {
      return { ok: true, status: 200, json: async () => opts.perms };
    }
    if (url.endsWith("/authorize")) {
      const body = JSON.parse((init && init.body) || "{}");
      const d = opts.decide(body.permission);
      return { ok: d.status < 400, status: d.status, json: async () => d };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

describe("ScuteVerifier", () => {
  it("resolves a user identity from /permissions", async () => {
    const v = new ScuteVerifier({
      baseUrl: "https://api.scute.io",
      appId: "app_x",
      fetchImpl: mockFetch({
        perms: { m2m: false, user_id: "u1", roles: ["support"], permissions: ["orders:read"] },
        decide: () => ({ status: 200, allowed: true }),
      }),
    });
    const id = await v.resolveIdentity("tok");
    expect(id).toMatchObject({ kind: "user", id: "u1", roles: ["support"], permissions: ["orders:read"] });
  });

  it("maps /authorize responses to decisions", async () => {
    const v = new ScuteVerifier({
      baseUrl: "https://api.scute.io/",
      appId: "app_x",
      fetchImpl: mockFetch({
        perms: { permissions: [] },
        decide: (p) =>
          p === "ok"
            ? { status: 200, allowed: true }
            : p === "gated"
            ? { status: 403, allowed: false, requires_verification: true, verification_method: "totp" }
            : { status: 403, allowed: false },
      }),
    });
    expect(await v.authorize("t", "ok")).toMatchObject({ allowed: true });
    expect(await v.authorize("t", "gated")).toMatchObject({ allowed: false, requiresVerification: true, verificationMethod: "totp" });
    expect(await v.authorize("t", "denied")).toMatchObject({ allowed: false });
  });
});

describe("AgentGuard + ScuteVerifier (authorize fast-path)", () => {
  function guardWith(perms: any, decide: (p: string) => any) {
    const sink = new MemorySink();
    const verifier = new ScuteVerifier({ baseUrl: "https://x", appId: "a", fetchImpl: mockFetch({ perms, decide }) });
    return { guard: new AgentGuard({ verifier, sink }), sink };
  }

  it("allows when the server allows", async () => {
    const { guard } = guardWith({ user_id: "u1", roles: ["support"], permissions: ["orders:refund"] }, () => ({ status: 200, allowed: true }));
    const res = await guard.run({ actor: "tok", action: "refund_order", permission: "orders:refund" });
    expect(res.decision).toBe("allowed");
  });

  it("blocks (rbac) when the server denies", async () => {
    const { guard } = guardWith({ user_id: "u1", roles: ["member"], permissions: [] }, () => ({ status: 403, allowed: false }));
    const res = await guard.run({ actor: "tok", action: "refund_order", permission: "orders:refund" });
    expect(res.decision).toBe("blocked_rbac");
  });

  it("needs a challenge for a gated permission (user)", async () => {
    const { guard } = guardWith(
      { m2m: false, user_id: "u1", roles: ["support"], permissions: ["orders:refund"] },
      () => ({ status: 403, allowed: false, requires_verification: true, verification_method: "totp" })
    );
    const res = await guard.run({ actor: "tok", action: "refund_order", permission: "orders:refund" });
    expect(res.decision).toBe("needs_challenge");
    expect(res.challenge?.method).toBe("totp");
  });

  it("escalates M2M on a gated permission to approval (server allows, gate flagged)", async () => {
    const { guard } = guardWith(
      { m2m: true, roles: ["support_bot"], permissions: ["orders:refund"] },
      () => ({ status: 200, allowed: true, requires_verification: true, verification_method: "totp" })
    );
    const res = await guard.run({ actor: "tok", action: "refund_order", permission: "orders:refund" });
    expect(res.decision).toBe("approval_required");
  });
});
