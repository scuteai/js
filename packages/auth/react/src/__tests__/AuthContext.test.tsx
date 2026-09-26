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

  it("derives isAuthenticated from session.status only, not from the user", () => {
    const { client, result } = renderAuth();
    // CURRENT BEHAVIOR (suspected bug): the AuthSession type promises
    // `isAuthenticated: true` implies a non-null user, but the provider sets
    // user and session independently from the event args, so an authenticated
    // session delivered with a null user yields isAuthenticated=true, user=null.
    act(() => client.emit(AUTH_CHANGE_EVENTS.TOKEN_REFRESHED, authenticatedSession(), null));
    expect(result.current.auth.isAuthenticated).toBe(true);
    expect(result.current.auth.user).toBeNull();
  });

  it("applies the session carried by non-session events too", () => {
    const { client, result } = renderAuth();
    act(() => client.emit(AUTH_CHANGE_EVENTS.SIGNED_IN, authenticatedSession(), makeUser()));
    expect(result.current.auth.isAuthenticated).toBe(true);
    // CURRENT BEHAVIOR (suspected bug): the real client delivers events that
    // carry no session (OTP_PENDING, MAGIC_PENDING, MFA_REQUIRED,
    // WEBAUTHN_VERIFY_START, MFA_ENROLLMENT_SUGGESTED...) as the
    // unauthenticated state with a null user. The provider does not filter by
    // event type, so a signed-in user who triggers e.g. sendLoginOtp for a
    // step-up is reported as signed out until the next session event.
    act(() => client.emit(AUTH_CHANGE_EVENTS.OTP_PENDING));
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.auth.user).toBeNull();
    expect(result.current.auth.session.status).toBe("unauthenticated");
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
