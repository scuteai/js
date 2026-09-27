/** Bug sweep: useCan keeps the previous answer while a new check is in flight. */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AUTH_CHANGE_EVENTS } from "@scute/js-core";
import { useCan } from "../useCan";
import { authenticatedSession, createFakeClient, deferred, makeUser, makeWrapper } from "./fakeScuteClient";

describe("useCan", () => {
  it("doesn't report the old resource's allow for a new resource", async () => {
    const pending = deferred<any>();
    const can = vi
      .fn()
      .mockImplementationOnce(async () => ({ data: { decision: "allow", allowed: true, reason: "role_grant" }, error: null }))
      .mockImplementationOnce(() => pending.promise);
    const client = createFakeClient({ authz: { can } });
    const { result, rerender } = renderHook(({ id }) => useCan("edit", `document:${id}`), {
      wrapper: makeWrapper(client),
      initialProps: { id: "1" },
    });
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_IN, authenticatedSession(), makeUser({ id: "usr_1" })));
    await waitFor(() => expect(result.current.allowed).toBe(true));

    rerender({ id: "2" }); // document:2, which this user may not edit
    await waitFor(() => expect(can).toHaveBeenCalledTimes(2));

    expect({ loading: result.current.loading, allowed: result.current.allowed }).toEqual({ loading: true, allowed: false });
    pending.resolve({ data: { decision: "deny", allowed: false, reason: "no_role_grants_permission" }, error: null });
  });
});
