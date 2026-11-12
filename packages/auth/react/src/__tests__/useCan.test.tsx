import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_CHANGE_EVENTS } from "@scute/js-core";
import { useCan, usePermissions } from "../useCan";
import { authenticatedSession, createFakeClient, deferred, makeUser, makeWrapper } from "./fakeScuteClient";

afterEach(() => {
  vi.restoreAllMocks();
});

// Matches the API: `allowed` is true only for a plain "allow".
const decision = (d: string) => ({ decision: d, allowed: d === "allow", reason: "role_grant", permission: "document:edit" });

function setup<T>(hook: () => T, authz: Record<string, unknown>) {
  const client = createFakeClient({ authz });
  const rendered = renderHook(hook, { wrapper: makeWrapper(client) });
  return { client, ...rendered };
}

const signIn = (client: ReturnType<typeof createFakeClient>, id = "usr_1") =>
  act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_IN, authenticatedSession(), makeUser({ id })));

describe("useCan", () => {
  it("doesn't ask while signed out", () => {
    const can = vi.fn();
    const { result } = setup(() => useCan("edit", "document:1"), { can });

    expect(result.current.allowed).toBe(false);
    expect(can).not.toHaveBeenCalled();
  });

  it("asks once signed in and reports allow", async () => {
    const can = vi.fn(async () => ({ data: decision("allow"), error: null }));
    const { client, result } = setup(() => useCan("edit", "document:1"), { can });

    signIn(client);

    await waitFor(() => expect(result.current.allowed).toBe(true));
    expect(can).toHaveBeenCalledWith("edit", "document:1", undefined);
  });

  it("reports step-up as not allowed yet", async () => {
    const can = vi.fn(async () => ({ data: decision("allow_with_step_up"), error: null }));
    const { client, result } = setup(() => useCan("delete", "invoice:9"), { can });

    signIn(client);

    await waitFor(() => expect(result.current.needsStepUp).toBe(true));
    expect(result.current.allowed).toBe(false);
  });

  it("reports approval as not allowed yet", async () => {
    const can = vi.fn(async () => ({ data: decision("allow_with_approval"), error: null }));
    const { client, result } = setup(() => useCan("pay", "invoice:9"), { can });

    signIn(client);

    await waitFor(() => expect(result.current.needsApproval).toBe(true));
    expect(result.current.allowed).toBe(false);
  });

  it("keeps the newest answer when checks for the same inputs overlap", async () => {
    // Same user, same action: only the request counter can tell the late
    // first answer from the newer one (the inputs key is identical).
    const first = deferred<any>();
    const can = vi.fn(async () => ({ data: decision("allow"), error: null }));
    const { client, result } = setup(() => useCan("edit"), { can });

    signIn(client);
    await waitFor(() => expect(result.current.allowed).toBe(true));

    can.mockImplementationOnce(() => first.promise).mockImplementationOnce(async () => ({ data: decision("deny"), error: null }));
    let slow!: Promise<void>;
    act(() => {
      slow = result.current.refetch();
    });
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.decision?.decision).toBe("deny");

    await act(async () => {
      first.resolve({ data: decision("allow"), error: null });
      await slow;
    });

    expect(can).toHaveBeenCalledTimes(3);
    expect(result.current.decision?.decision).toBe("deny");
    expect(result.current.allowed).toBe(false);
  });

  it("surfaces errors", async () => {
    const can = vi.fn(async () => ({ data: null, error: { message: "Client-side permission checks are off for this app" } }));
    const { client, result } = setup(() => useCan("edit"), { can });

    signIn(client);

    await waitFor(() => expect(result.current.error?.message).toMatch(/off/));
    expect(result.current.allowed).toBe(false);
  });
});

describe("usePermissions", () => {
  it("answers has() from the permission list", async () => {
    const permissions = vi.fn(async () => ({
      data: { user_id: "usr_1", roles: ["editor"], permissions: ["billing.export"], step_up: [] },
      error: null,
    }));
    const { client, result } = setup(() => usePermissions(), { permissions });

    signIn(client);

    await waitFor(() => expect(result.current.has("billing.export")).toBe(true));
    expect(result.current.has("billing.delete")).toBe(false);
  });
});
