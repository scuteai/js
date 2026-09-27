import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAlternatePhones } from "../useAlternatePhones";
import { createFakeClient, deferred, makeWrapper } from "./fakeScuteClient";

afterEach(() => {
  vi.restoreAllMocks();
});

const PHONES = [
  { phone: "+15555550101", label: "work", verified_at: "2026-01-01T00:00:00Z", usable_for_login: true },
  { phone: "+15555550102", label: null, verified_at: "2026-02-01T00:00:00Z", usable_for_login: false },
];

function setup(overrides: Record<string, unknown> = {}) {
  const client = createFakeClient({
    listAlternatePhones: vi.fn(async () => ({ data: { alternate_phones: PHONES }, error: null })),
    ...overrides,
  });
  const r = renderHook(() => useAlternatePhones(), { wrapper: makeWrapper(client) });
  return { client, ...r };
}

async function loaded(overrides: Record<string, unknown> = {}) {
  const r = setup(overrides);
  await waitFor(() => expect(r.result.current.loading).toBe(false));
  return r;
}

describe("loading", () => {
  it("fetches the list on mount", async () => {
    const d = deferred<any>();
    const { client, result } = setup({ listAlternatePhones: vi.fn(() => d.promise) });
    expect(result.current.loading).toBe(true);
    expect(result.current.phones).toEqual([]);
    expect(client.listAlternatePhones).toHaveBeenCalledWith();
    await act(async () => d.resolve({ data: { alternate_phones: PHONES }, error: null }));
    expect(result.current.loading).toBe(false);
    expect(result.current.phones).toEqual(PHONES);
    expect(result.current.error).toBeNull();
  });

  it("treats a missing alternate_phones field as empty", async () => {
    const { result } = await loaded({ listAlternatePhones: vi.fn(async () => ({ data: {}, error: null })) });
    expect(result.current.phones).toEqual([]);
  });

  it("stores the load error message and clears the list", async () => {
    const { client, result } = await loaded();
    client.listAlternatePhones.mockResolvedValueOnce({ data: null, error: { json: { error: "Unauthorized" } } });
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.error).toBe("Unauthorized");
    expect(result.current.phones).toEqual([]);
  });

  it("falls back to a generic load error message", async () => {
    const { result } = await loaded({
      listAlternatePhones: vi.fn(async () => ({ data: null, error: { status: 500 } })),
    });
    expect(result.current.error).toBe("Failed to load alternate phones");
  });
});

describe("add", () => {
  it("sends (phone, label) and returns the challenge token and normalized phone", async () => {
    const { client, result } = await loaded();
    client.addAlternatePhone.mockResolvedValue({
      data: { challenge_token: "chl_phone_1", phone: "+15555550199", label: "home" },
      error: null,
    });
    let res: any;
    await act(async () => {
      res = await result.current.add("(555) 555-0199", "home");
    });
    expect(client.addAlternatePhone).toHaveBeenCalledWith("(555) 555-0199", "home");
    expect(res).toEqual({ ok: true, data: { challengeToken: "chl_phone_1", phone: "+15555550199" } });
    // Not persisted until verify, so no refetch.
    expect(client.listAlternatePhones).toHaveBeenCalledTimes(1);
  });

  it("passes an undefined label through when none is given", async () => {
    const { client, result } = await loaded();
    client.addAlternatePhone.mockResolvedValue({ data: { challenge_token: "t", phone: "+1" }, error: null });
    await act(async () => {
      await result.current.add("+15555550199");
    });
    expect(client.addAlternatePhone).toHaveBeenCalledWith("+15555550199", undefined);
  });

  it.each([
    ["json.error_code", { json: { error_code: "phone_is_canonical", error: "That's your main number" } }, "phone_is_canonical", "That's your main number"],
    ["code", { code: "phone_already_registered", message: "Already added" }, "phone_already_registered", "Already added"],
    ["error_code", { error_code: "alternate_phone_cap_exceeded", error: "Max 5" }, "alternate_phone_cap_exceeded", "Max 5"],
    ["an invalid_phone code", { code: "invalid_phone", message: "Bad number" }, "invalid_phone", "Bad number"],
    ["an unrecognized code", { code: "rate_limited", message: "Slow down" }, "unknown", "Slow down"],
    ["no code or message", {}, "unknown", "Failed to start registration"],
  ])("maps an error with %s", async (_l, err, code, message) => {
    const { client, result } = await loaded();
    client.addAlternatePhone.mockResolvedValue({ data: null, error: err });
    let res: any;
    await act(async () => {
      res = await result.current.add("+15555550199");
    });
    expect(res).toEqual({ ok: false, error: { code, message } });
  });

  it("fails when the server returns no challenge token", async () => {
    const { client, result } = await loaded();
    client.addAlternatePhone.mockResolvedValue({ data: { phone: "+15555550199" }, error: null });
    let res: any;
    await act(async () => {
      res = await result.current.add("+15555550199");
    });
    expect(res).toEqual({ ok: false, error: { code: "unknown", message: "Failed to start registration" } });
  });
});

describe("verify", () => {
  it("sends (challengeToken, code) and refetches on success", async () => {
    const { client, result } = await loaded();
    client.verifyAlternatePhoneChallenge.mockResolvedValue({ data: {}, error: null });
    const added = { phone: "+15555550199", label: "home", verified_at: "2026-03-01T00:00:00Z" };
    client.listAlternatePhones.mockResolvedValueOnce({ data: { alternate_phones: [...PHONES, added] }, error: null });
    let res: any;
    await act(async () => {
      res = await result.current.verify("chl_phone_1", "123456");
    });
    expect(client.verifyAlternatePhoneChallenge).toHaveBeenCalledWith("chl_phone_1", "123456");
    expect(res).toEqual({ ok: true, data: {} });
    expect(result.current.phones).toHaveLength(3);
  });

  it("returns a mapped error and skips the refetch on failure", async () => {
    const { client, result } = await loaded();
    client.verifyAlternatePhoneChallenge.mockResolvedValue({ data: null, error: { message: "Invalid code" } });
    let res: any;
    await act(async () => {
      res = await result.current.verify("chl_phone_1", "000000");
    });
    expect(res).toEqual({ ok: false, error: { code: "unknown", message: "Invalid code" } });
    expect(client.listAlternatePhones).toHaveBeenCalledTimes(1);
  });

  it("uses a fallback message for an empty verify error", async () => {
    const { client, result } = await loaded();
    client.verifyAlternatePhoneChallenge.mockResolvedValue({ data: null, error: {} });
    let res: any;
    await act(async () => {
      res = await result.current.verify("t", "1");
    });
    expect(res.error.message).toBe("Verification failed");
  });
});

describe("remove", () => {
  it("sends the phone and refetches on success", async () => {
    const { client, result } = await loaded();
    client.removeAlternatePhone.mockResolvedValue({ data: {}, error: null });
    client.listAlternatePhones.mockResolvedValueOnce({ data: { alternate_phones: [PHONES[1]] }, error: null });
    let res: any;
    await act(async () => {
      res = await result.current.remove("+15555550101");
    });
    expect(client.removeAlternatePhone).toHaveBeenCalledWith("+15555550101");
    expect(res).toEqual({ ok: true, data: {} });
    expect(result.current.phones).toEqual([PHONES[1]]);
  });

  it("returns a mapped error on failure", async () => {
    const { client, result } = await loaded();
    client.removeAlternatePhone.mockResolvedValue({
      data: null,
      error: { json: { error_code: "alternate_phone_not_found" } },
    });
    let res: any;
    await act(async () => {
      res = await result.current.remove("+19999999999");
    });
    expect(res).toEqual({ ok: false, error: { code: "alternate_phone_not_found", message: "Failed to remove" } });
    expect(client.listAlternatePhones).toHaveBeenCalledTimes(1);
  });
});
