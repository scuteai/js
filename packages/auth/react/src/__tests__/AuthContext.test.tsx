import { StrictMode } from "react";
import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_CHANGE_EVENTS } from "@scute/js-core";
import { AuthContextProvider, useAuth, useScuteClient } from "../AuthContext";
import {
  authenticatedSession,
  createFakeClient,
  makeUser,
  makeWrapper,
  unauthenticatedSession,
} from "./fakeScuteClient";

afterEach(() => {
  vi.restoreAllMocks();
});

function renderAuth(client = createFakeClient()) {
  const hook = renderHook(
    () => ({ auth: useAuth(), client: useScuteClient() }),
    { wrapper: makeWrapper(client) }
  );
  return { client, ...hook };
}

describe("AuthContextProvider initialization", () => {
  it("starts in the loading state with no user before any auth event", () => {
    const { result } = renderAuth();
    const { auth } = result.current;
    expect(auth.isLoading).toBe(true);
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.user).toBeNull();
    expect(auth.session).toEqual({
      access: null,
      accessExpiresAt: null,
      refresh: null,
      refreshExpiresAt: null,
      status: "loading",
    });
  });

  it("subscribes to the client exactly once on mount", () => {
    const { client } = renderAuth();
    expect(client.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(typeof client.onAuthStateChange.mock.calls[0][0]).toBe("function");
    expect(client.listeners.size).toBe(1);
  });

  it("renders its children", () => {
    const client = createFakeClient();
    render(
      <AuthContextProvider scuteClient={client}>
        <p>child content</p>
      </AuthContextProvider>
    );
    expect(screen.getByText("child content")).toBeTruthy();
  });

  it("exposes the exact client instance through useScuteClient", () => {
    const { client, result } = renderAuth();
    expect(result.current.client).toBe(client);
  });
});

describe("AuthContextProvider state transitions on client events", () => {
  it("INITIAL_SESSION with an unauthenticated session ends loading, stays signed out", () => {
    const { client, result } = renderAuth();
    act(() => client.emit(AUTH_CHANGE_EVENTS.INITIAL_SESSION, unauthenticatedSession(), null));
    expect(result.current.auth.isLoading).toBe(false);
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.auth.user).toBeNull();
    expect(result.current.auth.session.status).toBe("unauthenticated");
  });

  it("SIGNED_IN stores the session and user and flips isAuthenticated", () => {
    const { client, result } = renderAuth();
    const session = authenticatedSession("access.jwt.SIGNIN");
    const user = makeUser({ email: "grace@example.com" });
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_IN, session, user));
    expect(result.current.auth.isAuthenticated).toBe(true);
    expect(result.current.auth.isLoading).toBe(false);
    expect(result.current.auth.user).toBe(user);
    expect(result.current.auth.session).toBe(session);
  });

  it("SIGNED_OUT after SIGNED_IN clears the user and the session", () => {
    const { client, result } = renderAuth();
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_IN, authenticatedSession(), makeUser()));
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_OUT, unauthenticatedSession(), null));
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.auth.isLoading).toBe(false);
    expect(result.current.auth.user).toBeNull();
    expect(result.current.auth.session.access).toBeNull();
  });

  it("TOKEN_REFRESHED replaces the session with the refreshed tokens", () => {
    const { client, result } = renderAuth();
    const user = makeUser();
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_IN, authenticatedSession("access.jwt.OLD"), user));
    const refreshed = authenticatedSession("access.jwt.NEW");
    act(() => client.emit(AUTH_CHANGE_EVENTS.TOKEN_REFRESHED, refreshed, user));
    expect(result.current.auth.session).toBe(refreshed);
    expect(result.current.auth.session.access).toBe("access.jwt.NEW");
    expect(result.current.auth.isAuthenticated).toBe(true);
    expect(result.current.auth.user).toBe(user);
  });

  it("SESSION_EXPIRED with the unauthenticated state signs the user out", () => {
    const { client, result } = renderAuth();
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_IN, authenticatedSession(), makeUser()));
    act(() => client.emit(AUTH_CHANGE_EVENTS.SESSION_EXPIRED, unauthenticatedSession(), null));
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.auth.user).toBeNull();
  });

  it("requires a user as well as an authenticated session for isAuthenticated", () => {
    const { client, result } = renderAuth();
    // The AuthSession type promises that isAuthenticated=true comes with a user.
    act(() => client.emit(AUTH_CHANGE_EVENTS.TOKEN_REFRESHED, authenticatedSession(), null));
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.auth.isLoading).toBe(false);
    expect(result.current.auth.user).toBeNull();
  });

  it.each([
    AUTH_CHANGE_EVENTS.SESSION_REFETCH,
    AUTH_CHANGE_EVENTS.WEBAUTHN_REGISTER_START,
    AUTH_CHANGE_EVENTS.WEBAUTHN_REGISTER_SUCCESS,
  ])("applies the session carried by %s", (event) => {
    const { client, result } = renderAuth();
    const session = authenticatedSession("access.jwt.EVT");
    const user = makeUser();
    act(() => client.emit(event, session, user));
    expect(result.current.auth.isAuthenticated).toBe(true);
    expect(result.current.auth.session).toBe(session);
    expect(result.current.auth.user).toBe(user);
  });

  it.each([
    AUTH_CHANGE_EVENTS.OTP_PENDING,
    AUTH_CHANGE_EVENTS.OTP_NEW_DEVICE_PENDING,
    AUTH_CHANGE_EVENTS.MAGIC_PENDING,
    AUTH_CHANGE_EVENTS.MAGIC_NEW_DEVICE_PENDING,
    AUTH_CHANGE_EVENTS.MAGIC_VERIFIED,
    AUTH_CHANGE_EVENTS.MAGIC_VERIFIED_OAUTH,
    AUTH_CHANGE_EVENTS.WEBAUTHN_VERIFY_START,
    AUTH_CHANGE_EVENTS.WEBAUTHN_VERIFY_SUCCESS,
    AUTH_CHANGE_EVENTS.MFA_REQUIRED,
    AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_REQUIRED,
    AUTH_CHANGE_EVENTS.MFA_ENROLLMENT_SUGGESTED,
    AUTH_CHANGE_EVENTS.MFA_VERIFIED,
  ])("keeps the signed-in session through %s, which carries no session", (event) => {
    const { client, result } = renderAuth();
    const session = authenticatedSession();
    const user = makeUser();
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_IN, session, user));
    // The real client delivers these events with the unauthenticated
    // placeholder and a null user (the fake's emit() does the same).
    act(() => client.emit(event));
    expect(result.current.auth.isAuthenticated).toBe(true);
    expect(result.current.auth.user).toBe(user);
    expect(result.current.auth.session).toBe(session);
  });

  it("stays loading when an event without a session arrives before the initial session", () => {
    const { client, result } = renderAuth();
    act(() => client.emit(AUTH_CHANGE_EVENTS.MAGIC_PENDING));
    expect(result.current.auth.isLoading).toBe(true);
    expect(result.current.auth.session.status).toBe("loading");
    act(() => client.emit(AUTH_CHANGE_EVENTS.INITIAL_SESSION, unauthenticatedSession(), null));
    expect(result.current.auth.isLoading).toBe(false);
  });
});

describe("AuthContextProvider signOut", () => {
  it("delegates to scuteClient.signOut and resolves with its value", async () => {
    const { client, result } = renderAuth();
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_IN, authenticatedSession(), makeUser()));
    let returned: unknown;
    await act(async () => {
      returned = await result.current.auth.signOut();
    });
    expect(client.signOut).toHaveBeenCalledTimes(1);
    expect(client.signOut).toHaveBeenCalledWith();
    expect(returned).toBe(true);
    // The fake client emits SIGNED_OUT like the real one does.
    expect(result.current.auth.isAuthenticated).toBe(false);
  });
});

describe("AuthContextProvider cleanup", () => {
  it("unsubscribes from the client on unmount", () => {
    const { client, unmount } = renderAuth();
    expect(client.unsubscribes).toHaveLength(1);
    unmount();
    expect(client.unsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(client.listeners.size).toBe(0);
  });

  it("re-subscribes when the scuteClient prop changes and ignores the old client", () => {
    const first = createFakeClient();
    const second = createFakeClient();
    const Probe = () => {
      const auth = useAuth();
      const client = useScuteClient();
      return (
        <p>
          {client === first ? "first" : "second"}:{auth.user ? (auth.user as any).email : "none"}
        </p>
      );
    };
    const { rerender } = render(
      <AuthContextProvider scuteClient={first}>
        <Probe />
      </AuthContextProvider>
    );
    rerender(
      <AuthContextProvider scuteClient={second}>
        <Probe />
      </AuthContextProvider>
    );
    expect(first.unsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(second.onAuthStateChange).toHaveBeenCalledTimes(1);
    act(() => first.emit(AUTH_CHANGE_EVENTS.SIGNED_IN, authenticatedSession(), makeUser({ email: "old@example.com" })));
    expect(screen.getByText("second:none")).toBeTruthy();
    act(() => second.emit(AUTH_CHANGE_EVENTS.SIGNED_IN, authenticatedSession(), makeUser({ email: "new@example.com" })));
    expect(screen.getByText("second:new@example.com")).toBeTruthy();
  });

  it("leaves exactly one live subscription under StrictMode double effects", () => {
    const client = createFakeClient();
    render(
      <StrictMode>
        <AuthContextProvider scuteClient={client}>
          <span />
        </AuthContextProvider>
      </StrictMode>
    );
    expect(client.onAuthStateChange).toHaveBeenCalledTimes(2);
    expect(client.unsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(client.listeners.size).toBe(1);
  });
});

describe("hooks outside a provider", () => {
  it("useScuteClient throws a descriptive error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useScuteClient())).toThrow(
      "useScuteClient must be used within a AuthContextProvider."
    );
  });

  it("useAuth throws a descriptive error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within a AuthContextProvider."
    );
  });
});
