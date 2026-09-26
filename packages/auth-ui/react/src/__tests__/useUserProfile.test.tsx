import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUserProfile } from "../useUserProfile";
import {
  AUTH_CHANGE_EVENTS,
  USER,
  createFakeClient,
  deferred,
  makeWrapper,
} from "./fakeScuteClient";

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(overrides: Record<string, unknown> = {}) {
  const client = createFakeClient(overrides);
  const r = renderHook(() => useUserProfile(), { wrapper: makeWrapper(client) });
  return { client, ...r };
}

function signedIn(overrides: Record<string, unknown> = {}) {
  const r = setup(overrides);
  act(() => r.client.emitSignedIn());
  return r;
}

describe("auth passthrough", () => {
  it("is loading with no user before the session resolves", () => {
    const { result } = setup();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.isUpdating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("exposes the signed-in user from the auth context", () => {
    const { result } = signedIn();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(USER);
  });

  it("goes back to no user after SIGNED_OUT", () => {
    const { client, result } = signedIn();
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_OUT));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("signOut calls the client's signOut", async () => {
    const { client, result } = signedIn();
    await act(async () => {
      await result.current.signOut();
    });
    expect(client.signOut).toHaveBeenCalledTimes(1);
    expect(result.current.user).toBeNull();
  });
});

describe("updateMeta", () => {
  it("sends the meta object as-is, tracks isUpdating and refetches on success", async () => {
    const { client, result } = signedIn();
    const d = deferred<any>();
    client.updateUserMeta.mockReturnValue(d.promise);
    const meta = { plan: "enterprise", seats: 25 };
    let pending!: Promise<any>;
    act(() => {
      pending = result.current.updateMeta(meta);
    });
    expect(result.current.isUpdating).toBe(true);
    expect(client.updateUserMeta).toHaveBeenCalledWith(meta);
    let res: any;
    await act(async () => {
      d.resolve({ data: {}, error: null });
      res = await pending;
    });
    expect(res).toEqual({ ok: true });
    expect(result.current.isUpdating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(client.getUser).toHaveBeenCalledTimes(1);
    expect(client.getUser).toHaveBeenCalledWith();
  });

  it("does not update the user in context after a successful update", async () => {
    const updated = { ...USER, meta: { plan: "enterprise" } };
    const { client, result } = signedIn({
      updateUserMeta: vi.fn(async () => ({ data: {}, error: null })),
      // Real getUser just returns the user; it emits no auth event.
      getUser: vi.fn(async () => ({ data: { user: updated }, error: null })),
    });
    await act(async () => {
      await result.current.updateMeta({ plan: "enterprise" });
    });
    expect(client.getUser).toHaveBeenCalled();
    // CURRENT BEHAVIOR (suspected bug): refetch() says it re-emits the
    // session so the provider re-renders, but client.getUser() emits
    // nothing, so `user` stays stale until the next auth event.
    expect(result.current.user).toEqual(USER);
  });

  it("maps per-field validation errors into fieldErrors", async () => {
    const { client, result } = signedIn();
    client.updateUserMeta.mockResolvedValue({
      data: null,
      error: {
        json: {
          error: "Validation failed",
          errors: [
            { key: "seats", message: "must be positive" },
            { key: "plan", message: "is not included in the list" },
            { key: "", message: "dropped: no key" },
            { key: "orphan" },
          ],
        },
      },
    });
    let res: any;
    await act(async () => {
      res = await result.current.updateMeta({ seats: -1, plan: "x" });
    });
    expect(res).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message: "Validation failed",
        fieldErrors: { seats: "must be positive", plan: "is not included in the list" },
      },
    });
    expect(result.current.error).toBe("Validation failed");
    expect(result.current.isUpdating).toBe(false);
    expect(client.getUser).not.toHaveBeenCalled();
  });

  it("reports unknown with no fieldErrors when the API gives no errors array", async () => {
    const { client, result } = signedIn();
    client.updateUserMeta.mockResolvedValue({ data: null, error: { message: "Server exploded" } });
    let res: any;
    await act(async () => {
      res = await result.current.updateMeta({ plan: "x" });
    });
    expect(res).toEqual({
      ok: false,
      error: { code: "unknown", message: "Server exploded", fieldErrors: undefined },
    });
  });

  it("reports validation_error with empty fieldErrors for an empty errors array", async () => {
    const { client, result } = signedIn();
    client.updateUserMeta.mockResolvedValue({ data: null, error: { json: { errors: [] } } });
    let res: any;
    await act(async () => {
      res = await result.current.updateMeta({});
    });
    expect(res.error.code).toBe("validation_error");
    expect(res.error.fieldErrors).toEqual({});
    expect(res.error.message).toBe("Failed to update profile");
  });

  it("clears the previous error at the start of the next update", async () => {
    const { client, result } = signedIn();
    client.updateUserMeta.mockResolvedValueOnce({ data: null, error: { message: "nope" } });
    await act(async () => {
      await result.current.updateMeta({ a: 1 });
    });
    expect(result.current.error).toBe("nope");
    client.updateUserMeta.mockResolvedValueOnce({ data: {}, error: null });
    await act(async () => {
      await result.current.updateMeta({ a: 2 });
    });
    expect(result.current.error).toBeNull();
  });

  it("lets a thrown update escape and resets isUpdating", async () => {
    const { client, result } = signedIn();
    client.updateUserMeta.mockRejectedValue(new Error("offline"));
    await act(async () => {
      await expect(result.current.updateMeta({ a: 1 })).rejects.toThrow("offline");
    });
    expect(result.current.isUpdating).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

describe("refetch", () => {
  it("calls client.getUser()", async () => {
    const { client, result } = signedIn();
    await act(async () => {
      await result.current.refetch();
    });
    expect(client.getUser).toHaveBeenCalledWith();
  });

  it("is a no-op when the client has no getUser", async () => {
    const { result } = signedIn({ getUser: undefined });
    await act(async () => {
      await expect(result.current.refetch()).resolves.toBeUndefined();
    });
  });
});
