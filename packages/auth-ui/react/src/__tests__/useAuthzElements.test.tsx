import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useElementAccessRequests, useElementDecisionLog, useElementUserRoles } from "../useAuthzElements";

afterEach(() => {
  vi.restoreAllMocks();
});

const ok = <T,>(data: T) => ({ data, error: null });

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    users: vi.fn(async () => ok({ total: 1, users: [{ id: "u1", email: "ada@acme.test", roles: [] }] })),
    roles: vi.fn(async () => ok({ roles: [{ slug: "auditor", name: "Auditor" }], assignable: ["auditor"] })),
    assignRole: vi.fn(async () => ok({ role: "auditor" })),
    revokeRole: vi.fn(async () => ok({})),
    requests: vi.fn(async () =>
      ok([
        { id: "r1", kind: "role", status: "pending" },
        { id: "r2", kind: "operation", status: "pending" },
      ])
    ),
    approve: vi.fn(async () => ok({ id: "r1", status: "approved" })),
    deny: vi.fn(async () => ok({ id: "r1", status: "denied" })),
    decisions: vi.fn(async () => ok({ decisions: [{ id: "d1", decision: "deny", at: "2026-09-27T00:00:00Z" }] })),
    ...overrides,
  } as any;
}

describe("useElementUserRoles", () => {
  it("loads users and assignable roles, and searches", async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useElementUserRoles({ api }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.users.map((u) => u.id)).toEqual(["u1"]);
    expect(result.current.assignable).toEqual(["auditor"]);

    act(() => result.current.search("ada"));
    await waitFor(() => expect(api.users).toHaveBeenLastCalledWith({ q: "ada" }));
  });

  it("assigns and refreshes; reports refusals", async () => {
    const api = fakeApi({
      revokeRole: vi.fn(async () => ({ data: null, error: { message: "nope", json: { error: "This grant comes from SCIM", error_code: "managed_by_idp" } } })),
    });
    const { result } = renderHook(() => useElementUserRoles({ api }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome: any;
    await act(async () => {
      outcome = await result.current.assign("u1", "auditor");
    });
    expect(outcome).toEqual({ ok: true });
    expect(api.users).toHaveBeenCalledTimes(2);

    await act(async () => {
      outcome = await result.current.revoke("u1", "auditor");
    });
    expect(outcome).toEqual({ ok: false, error: { code: "managed_by_idp", message: "This grant comes from SCIM" } });
  });
});

describe("useElementAccessRequests", () => {
  it("filters by kind and refreshes after a decision", async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useElementAccessRequests({ api }, { kind: "operation" }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.requests.map((r) => r.id)).toEqual(["r2"]);

    await act(async () => {
      await result.current.approve("r2", "ok");
    });
    expect(api.approve).toHaveBeenCalledWith("r2", "ok");
    expect(api.requests).toHaveBeenCalledTimes(2);
  });
});

describe("useElementDecisionLog", () => {
  it("pages with loadMore", async () => {
    const api = fakeApi({
      decisions: vi
        .fn()
        .mockResolvedValueOnce(ok({ decisions: [{ id: "d1", decision: "deny", at: "t1" }], next: "d1" }))
        .mockResolvedValueOnce(ok({ decisions: [{ id: "d0", decision: "allow", at: "t0" }] })),
    });
    const { result } = renderHook(() => useElementDecisionLog({ api }));

    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.decisions.map((d) => d.id)).toEqual(["d1", "d0"]);
    expect(result.current.hasMore).toBe(false);
    expect(api.decisions).toHaveBeenLastCalledWith({ before: "d1" });
  });
});
