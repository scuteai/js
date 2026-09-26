import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSessions } from "../useSessions";
import { createFakeClient, deferred, makeWrapper } from "./fakeScuteClient";

afterEach(() => {
  vi.restoreAllMocks();
});

const SESSIONS = [
  { id: 11, nickname: "current", browser: "Firefox", platform: "macOS", credential_id: null },
  { id: 12, nickname: null, browser: "Safari", platform: "iOS", credential_id: "cred_ios" },
];

function setup(overrides: Record<string, unknown> = {}) {
  const client = createFakeClient({
    listUserSessions: vi.fn(async () => ({ data: SESSIONS, error: null })),
    ...overrides,
  });
  const r = renderHook(() => useSessions(), { wrapper: makeWrapper(client) });
  return { client, ...r };
}

async function loaded(overrides: Record<string, unknown> = {}) {
  const r = setup(overrides);
  await waitFor(() => expect(r.result.current.loading).toBe(false));
  return r;
}

describe("loading", () => {
  it("fetches the session list on mount", async () => {
    const d = deferred<any>();
    const { client, result } = setup({ listUserSessions: vi.fn(() => d.promise) });
    expect(result.current.loading).toBe(true);
    expect(result.current.sessions).toEqual([]);
    expect(client.listUserSessions).toHaveBeenCalledTimes(1);
    expect(client.listUserSessions).toHaveBeenCalledWith();
    await act(async () => d.resolve({ data: SESSIONS, error: null }));
    expect(result.current.loading).toBe(false);
    expect(result.current.sessions).toEqual(SESSIONS);
    expect(result.current.error).toBeNull();
  });

  it("treats null data as an empty list", async () => {
    const { result } = await loaded({ listUserSessions: vi.fn(async () => ({ data: null, error: null })) });
    expect(result.current.sessions).toEqual([]);
  });

  it.each([
    ["json.error", { json: { error: "Token expired" }, message: "HTTP 401" }, "Token expired"],
    ["message", { message: "Network error" }, "Network error"],
    ["error", { error: "Forbidden" }, "Forbidden"],
    ["no usable string", { status: 500 }, "Failed to load sessions"],
  ])("reads the error message from %s and clears the list", async (_l, err, message) => {
    const { client, result } = await loaded();
    client.listUserSessions.mockResolvedValueOnce({ data: null, error: err });
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.error).toBe(message);
    expect(result.current.sessions).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("clears a previous error after a successful refetch", async () => {
    const { client, result } = await loaded({
      listUserSessions: vi.fn(async () => ({ data: null, error: { message: "boom" } })),
    });
    expect(result.current.error).toBe("boom");
    client.listUserSessions.mockResolvedValueOnce({ data: SESSIONS, error: null });
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.sessions).toEqual(SESSIONS);
  });

  it("lets a thrown list error escape refetch without setting error", async () => {
    const { client, result } = await loaded();
    client.listUserSessions.mockRejectedValueOnce(new Error("socket hang up"));
    // CURRENT BEHAVIOR (suspected bug): refetch has try/finally but no catch.
    // Called directly it rejects; called from the mount effect (which does
    // not await or catch) the same throw is an unhandled rejection. Either
    // way `error` is never set.
    await act(async () => {
      await expect(result.current.refetch()).rejects.toThrow("socket hang up");
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.sessions).toEqual(SESSIONS);
  });
});

describe("revoke", () => {
  it("revokes by id only and refetches on success", async () => {
    const { client, result } = await loaded();
    client.revokeSession.mockResolvedValue({ data: {}, error: null });
    client.listUserSessions.mockResolvedValueOnce({ data: [SESSIONS[0]], error: null });
    let res: any;
    await act(async () => {
      res = await result.current.revoke(12);
    });
    expect(client.revokeSession).toHaveBeenCalledTimes(1);
    expect(client.revokeSession.mock.calls[0]).toEqual([12]);
    expect(res).toEqual({ ok: true, data: {} });
    expect(client.listUserSessions).toHaveBeenCalledTimes(2);
    expect(result.current.sessions).toEqual([SESSIONS[0]]);
  });

  it("returns a structured error and skips the refetch on failure", async () => {
    const { client, result } = await loaded();
    client.revokeSession.mockResolvedValue({ data: null, error: { json: { error: "Not found" } } });
    let res: any;
    await act(async () => {
      res = await result.current.revoke(99);
    });
    expect(res).toEqual({ ok: false, error: { code: "unknown", message: "Not found" } });
    expect(client.listUserSessions).toHaveBeenCalledTimes(1);
    // revoke errors are returned, not stored.
    expect(result.current.error).toBeNull();
  });

  it("uses a fallback message when the revoke error has no text", async () => {
    const { client, result } = await loaded();
    client.revokeSession.mockResolvedValue({ data: null, error: {} });
    let res: any;
    await act(async () => {
      res = await result.current.revoke(12);
    });
    expect(res.error.message).toBe("Failed to revoke session");
  });

  it("revokes the current device's session like any other, without signing out locally", async () => {
    const { client, result } = await loaded();
    client.revokeSession.mockResolvedValue({ data: {}, error: null });
    expect(result.current.isCurrent(11)).toBe(true);
    await act(async () => {
      await result.current.revoke(11);
    });
    expect(client.revokeSession).toHaveBeenCalledWith(11);
    // CURRENT BEHAVIOR (suspected bug): revoking "this device" does not
    // clear the local session or call signOut, so the tab keeps acting
    // signed in until its access token is rejected.
    expect(client.signOut).not.toHaveBeenCalled();
  });
});

describe("isCurrent", () => {
  it("is true only for the session tagged nickname=current", async () => {
    const { result } = await loaded();
    expect(result.current.isCurrent(11)).toBe(true);
    expect(result.current.isCurrent(12)).toBe(false);
    expect(result.current.isCurrent(404)).toBe(false);
  });

  it("uses strict id equality, so a string id does not match a numeric one", async () => {
    const { result } = await loaded();
    expect(result.current.isCurrent("11")).toBe(false);
  });
});
