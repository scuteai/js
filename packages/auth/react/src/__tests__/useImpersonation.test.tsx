import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AUTH_CHANGE_EVENTS } from "@scute/js-core";
import { useImpersonation } from "../useImpersonation";
import { authenticatedSession, createFakeClient, makeUser, makeWrapper } from "./fakeScuteClient";

const b64url = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (payload: Record<string, unknown>) => `${b64url({ alg: "RS256" })}.${b64url(payload)}.sig`;
const exp = Math.floor(Date.parse("2030-01-01T00:00:00Z") / 1000);
const actor = { kind: "backend", sub: "support@acme.test", email: "support@acme.test" };

function setup(stopImpersonating = vi.fn(async () => true)) {
  const client = createFakeClient({ stopImpersonating });
  const rendered = renderHook(() => useImpersonation(), { wrapper: makeWrapper(client) });
  const signIn = (access: string) =>
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_IN, authenticatedSession(access), makeUser()));
  return { client, signIn, stopImpersonating, ...rendered };
}

describe("useImpersonation", () => {
  it("is quiet in a normal session", () => {
    const { result, signIn } = setup();
    signIn(jwt({ uuid: "usr_1", exp }));

    expect(result.current).toMatchObject({ impersonating: false, actor: null, expiresAt: null });
  });

  it("names who is really acting, and until when", () => {
    const { result, signIn } = setup();
    signIn(jwt({ uuid: "usr_1", exp, imp: true, act: actor }));

    expect(result.current.impersonating).toBe(true);
    expect(result.current.actor).toEqual(actor);
    expect(result.current.expiresAt?.toISOString()).toBe("2030-01-01T00:00:00.000Z");
  });

  it("stops through the client", async () => {
    const { result, signIn, stopImpersonating } = setup();
    signIn(jwt({ uuid: "usr_1", exp, imp: true, act: actor }));

    await act(async () => {
      expect(await result.current.stop()).toBe(true);
    });
    expect(stopImpersonating).toHaveBeenCalledTimes(1);
    expect(result.current.stopping).toBe(false);
  });
});
