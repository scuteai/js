import { StrictMode } from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContextProvider } from "../AuthContext";
import { createFakeClient } from "./fakeScuteClient";

// "Sign in as this user" from the dashboard opens the app with
// ?sct_imp=<code>; the provider swaps the code for the session as the user.

const open = (path: string) => window.history.replaceState(null, "", path);

beforeEach(() => open("/"));
afterEach(() => {
  vi.restoreAllMocks();
  open("/");
});

const handoffClient = (result: { error: unknown } = { error: null }) =>
  createFakeClient({ signInWithImpersonationHandoff: vi.fn(async () => result) });

describe("AuthContextProvider and the sign-in-as-user hand-off", () => {
  it("swaps the code from the address bar and removes it at once", async () => {
    open("/login?sct_imp=c0de&next=%2Fhome#top");
    const client = handoffClient();

    render(<AuthContextProvider scuteClient={client}><p>app</p></AuthContextProvider>);

    await waitFor(() => expect(client.signInWithImpersonationHandoff).toHaveBeenCalledWith("c0de"));
    expect(window.location.search).toBe("?next=%2Fhome");
    expect(window.location.hash).toBe("#top");
  });

  it("swaps it once under StrictMode", async () => {
    open("/login?sct_imp=c0de");
    const client = handoffClient();

    render(<StrictMode><AuthContextProvider scuteClient={client}><p>app</p></AuthContextProvider></StrictMode>);

    await waitFor(() => expect(client.signInWithImpersonationHandoff).toHaveBeenCalled());
    expect(client.signInWithImpersonationHandoff).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a code", () => {
    const client = handoffClient();

    render(<AuthContextProvider scuteClient={client}><p>app</p></AuthContextProvider>);

    expect(client.signInWithImpersonationHandoff).not.toHaveBeenCalled();
  });

  it("can be turned off", () => {
    open("/login?sct_imp=c0de");
    const client = handoffClient();

    render(<AuthContextProvider scuteClient={client} acceptImpersonationHandoff={false}><p>app</p></AuthContextProvider>);

    expect(client.signInWithImpersonationHandoff).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?sct_imp=c0de");
  });

  it("warns when the link was used or ran out, and the code is gone anyway", async () => {
    open("/login?sct_imp=used");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = handoffClient({ error: new Error("handoff_invalid") });

    render(<AuthContextProvider scuteClient={client}><p>app</p></AuthContextProvider>);

    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(window.location.search).toBe("");
  });
});
