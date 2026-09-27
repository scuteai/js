/** Bug sweep: useElementDecisionLog.loadMore appends the same page twice when called twice. */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useElementDecisionLog } from "../useAuthzElements";

describe("useElementDecisionLog", () => {
  it("loads each page once when loadMore is called twice quickly", async () => {
    const decisions = vi.fn(async (params: { before?: string }) =>
      params.before
        ? { data: { decisions: [{ id: "d2", decision: "allow", at: "" }], next: undefined }, error: null }
        : { data: { decisions: [{ id: "d1", decision: "deny", at: "" }], next: "d1" }, error: null }
    );
    const api = { decisions } as any;
    const { result } = renderHook(() => useElementDecisionLog({ api }));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    await act(async () => {
      // e.g. an infinite-scroll sentinel firing twice, or a double click
      await Promise.all([result.current.loadMore(), result.current.loadMore()]);
    });

    expect(result.current.decisions.map((d) => d.id)).toEqual(["d1", "d2"]);
  });
});
