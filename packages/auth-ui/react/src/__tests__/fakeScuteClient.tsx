// Test-only helpers for @scute/auth-ui-react: a fake ScuteClient that mirrors
// the real client's event contract, wired into the real AuthContextProvider
// from @scute/react-hooks. Not a test file itself (vitest only collects
// *.test.ts[x]).

import { StrictMode, type ReactNode } from "react";
import { act } from "@testing-library/react";
import { vi } from "vitest";
import { AUTH_CHANGE_EVENTS, AuthContextProvider } from "@scute/react-hooks";

export { AUTH_CHANGE_EVENTS };

export type Listener = (event: string, session: any, user: any) => unknown;

// Distinctive token strings so leak checks can grep for them.
export const ACCESS_TOKEN = "ACCESS.jwt.s3cr3t-access";
export const REFRESH_TOKEN = "REFRESH.jwt.s3cr3t-refresh";
export const MAGIC_TOKEN = "MAGIC.link.s3cr3t-magic";

export const AUTH_PAYLOAD = {
  access: ACCESS_TOKEN,
  refresh: REFRESH_TOKEN,
  access_expires_at: "2030-01-01T00:00:00Z",
  refresh_expires_at: "2030-02-01T00:00:00Z",
  csrf: "csrf-token-value",
};

export const USER = {
  id: "usr_1",
  email: "ada@example.com",
  phone: null,
  meta: { plan: "pro" },
};

export const unauthenticatedSession = () => ({
  access: null,
  accessExpiresAt: null,
  refresh: null,
  refreshExpiresAt: null,
  status: "unauthenticated" as const,
});

export const authenticatedSession = (access: string = ACCESS_TOKEN) => ({
  access,
  accessExpiresAt: new Date("2030-01-01T00:00:00Z"),
  refresh: REFRESH_TOKEN,
  refreshExpiresAt: new Date("2030-02-01T00:00:00Z"),
  status: "authenticated" as const,
});

export const DEFAULT_APP_DATA = {
  passkeys_enabled: true,
  mfa_methods_allowed: ["totp", "sms", "email", "backup_codes"],
};

export type FakeClient = ReturnType<typeof createFakeClient>;

// Same list as ScuteClient.onAuthStateChange's sessionEvents: for these the
// real client resolves the stored session before calling a listener when the
// event came without one.
const SESSION_EVENTS: readonly string[] = [
  AUTH_CHANGE_EVENTS.INITIAL_SESSION,
  AUTH_CHANGE_EVENTS.SESSION_EXPIRED,
  AUTH_CHANGE_EVENTS.SESSION_REFETCH,
  AUTH_CHANGE_EVENTS.TOKEN_REFRESHED,
  AUTH_CHANGE_EVENTS.SIGNED_IN,
  AUTH_CHANGE_EVENTS.SIGNED_OUT,
  AUTH_CHANGE_EVENTS.WEBAUTHN_REGISTER_START,
  AUTH_CHANGE_EVENTS.WEBAUTHN_REGISTER_SUCCESS,
];

// Events the real client forces a fresh session fetch for (no SESSION_REFETCH
// event is emitted for those).
const FORCED_REFETCH_EVENTS: readonly string[] = [
  AUTH_CHANGE_EVENTS.INITIAL_SESSION,
  AUTH_CHANGE_EVENTS.TOKEN_REFRESHED,
  AUTH_CHANGE_EVENTS.WEBAUTHN_REGISTER_START,
  AUTH_CHANGE_EVENTS.WEBAUTHN_REGISTER_SUCCESS,
];

type Handler = (payload: { event: string; session?: any; user?: any }) => Promise<void>;

export function createFakeClient(overrides: Record<string, unknown> = {}) {
  // One internal handler per subscriber, like the real client's emitter.
  const handlers = new Set<Handler>();
  const unsubscribes: Array<ReturnType<typeof vi.fn>> = [];
  let initPromise: Promise<{ error: any }> | null = null;

  // The real _initialize() runs once and is shared; the session lookup waits
  // for it. Calls its implementation without going through the spy, so tests
  // counting the hook's own _initialize() calls are unaffected.
  const ensureInitialized = () => {
    if (!initPromise) {
      const impl = client._initialize?.getMockImplementation?.() ?? client._initialize;
      initPromise = Promise.resolve()
        .then(() => impl())
        .then((r: any) => ({ error: r?.error ?? null }), (error: unknown) => ({ error }));
    }
    return initPromise;
  };

  // ScuteClient._getSession: the stored session (null when settings failed).
  const getStoredSession = async () => {
    const { error } = await ensureInitialized();
    if (error) return { session: null, user: null };
    return { session: client.session, user: client.user };
  };

  const dispatch = (payload: { event: string; session?: any; user?: any }) => {
    for (const handler of [...handlers]) void handler(payload);
  };

  const client: any = {
    /** The stored session and user, what the real client's _getSession reads. */
    session: unauthenticatedSession() as any,
    user: null as any,
    /** Set to an error to make signInWithTokenPayload fail (no session, no event). */
    tokenExchangeError: null as any,
    unsubscribes,
    get listenerCount() {
      return handlers.size;
    },
    /**
     * Mirrors ScuteClient.onAuthStateChange: replays INITIAL_SESSION (with the
     * stored session, once _initialize() settles) to every new subscriber; a
     * session event without a session (or with an access token but no user)
     * is delivered after the stored session is read; any other event without
     * a session reaches listeners as the unauthenticated state + null user.
     */
    onAuthStateChange: vi.fn((cb: Listener) => {
      let unsubscribed = false;
      const handler: Handler = async ({ event, session, user }) => {
        if (unsubscribed) return;
        if (SESSION_EVENTS.includes(event) && (!session || (session.access !== null && !user))) {
          const force = !user && FORCED_REFETCH_EVENTS.includes(event);
          ({ session, user } = await getStoredSession());
          if (!force && session?.status === "authenticated" && user) {
            dispatch({ event: AUTH_CHANGE_EVENTS.SESSION_REFETCH, session, user });
          }
        }
        if (unsubscribed) return;
        cb(event, session ?? unauthenticatedSession(), user ?? null);
      };
      handlers.add(handler);
      void handler({ event: AUTH_CHANGE_EVENTS.INITIAL_SESSION });
      const unsubscribe = vi.fn(() => {
        unsubscribed = true;
        handlers.delete(handler);
      });
      unsubscribes.push(unsubscribe);
      return unsubscribe;
    }),
    /**
     * ScuteClient.emitAuthChangeEvent. A session event that brings a session
     * stores it first (the real client persists before emitting); a sign-out
     * or expiry clears it, and is emitted with the unauthenticated state the
     * way the real client's signOut and _expireSession emit it.
     */
    emit(event: string, session?: any, user?: any) {
      if (event === AUTH_CHANGE_EVENTS.SIGNED_OUT || event === AUTH_CHANGE_EVENTS.SESSION_EXPIRED) {
        client.session = unauthenticatedSession();
        client.user = null;
        session ??= unauthenticatedSession();
      } else if (session && SESSION_EVENTS.includes(event)) {
        client.session = session;
        if (user !== undefined) client.user = user;
      }
      dispatch({ event, session, user });
    },
    /** Convenience: emit SIGNED_IN with a real-looking session + user. */
    emitSignedIn(user: any = USER) {
      client.emit(AUTH_CHANGE_EVENTS.SIGNED_IN, authenticatedSession(), user);
    },

    _initialize: vi.fn(async () => ({ error: null })),
    // Same lookup as ScuteClient.getMagicLinkToken: sct_magic, then sct_oauth.
    getMagicLinkToken: vi.fn((url?: string) => {
      const params = new URL(url ?? window.location.href).searchParams;
      return params.get("sct_magic") || params.get("sct_oauth");
    }),
    verifyMagicLinkToken: vi.fn(async () => ({
      data: { authPayload: AUTH_PAYLOAD, magicPayload: { userId: "usr_1" } },
      error: null,
    })),
    getAppData: vi.fn(async () => ({ data: { ...DEFAULT_APP_DATA }, error: null })),
    // Like the real client: stores the session, emits SIGNED_IN, returns
    // { error: null }; or, with `tokenExchangeError` set, fails without a
    // session or an event.
    signInWithTokenPayload: vi.fn(async (payload: any) => {
      if (client.tokenExchangeError) return { error: client.tokenExchangeError };
      client.emit(
        AUTH_CHANGE_EVENTS.SIGNED_IN,
        authenticatedSession(payload?.access ?? ACCESS_TOKEN),
        USER
      );
      return { error: null };
    }),
    signInOrUp: vi.fn(async () => ({ data: null, error: null })),
    getMagicLinkStatus: vi.fn(async () => ({ data: null, error: { message: "pending" } })),
    // Like the real client: attack protection's code step, MFA, the closed
    // window, or a sign-in.
    signInWithMagicLinkStatus: vi.fn(async (data: any) => {
      if (data?.verification_required === true) {
        client.emit(AUTH_CHANGE_EVENTS.VERIFICATION_REQUIRED);
        return {
          data: {
            verificationRequired: true,
            verification: data.verification ?? null,
            reason: data.reason,
            threats: data.threats ?? [],
          },
          error: null,
        };
      }
      if (data?.mfa_required) {
        client.pendingMfaChallenge = data;
        client.emit(AUTH_CHANGE_EVENTS.MFA_REQUIRED);
        return {
          data: { mfaRequired: true, mfaChallenge: data.mfa_challenge, availableMethods: data.available_methods },
          error: null,
        };
      }
      if (!data?.access) return { data: null, error: { code: "magic-link-window-closed", message: "closed" } };
      const signedIn = await client.signInWithTokenPayload(data);
      return { data: null, error: signedIn.error };
    }),
    verifyOtp: vi.fn(),
    verifyMfaChallenge: vi.fn(),
    addDevice: vi.fn(async () => ({ data: { id: "cred_1" }, error: null })),
    // A secure page with the WebAuthn API, unless a test says otherwise.
    isWebauthnSupported: vi.fn(() => true),
    // Resends (no pending event: the flow is already on the step).
    sendLoginMagicLink: vi.fn(async () => ({ data: { magic_link: { id: "ml_resent" } }, error: null })),
    sendLoginOtp: vi.fn(async () => ({ data: { otp: { id: "otp_resent" } }, error: null })),
    // Attack protection's code step for a magic link.
    verifySignInVerification: vi.fn(async () => ({
      data: { authPayload: AUTH_PAYLOAD, magicPayload: { userId: "usr_1" } },
      error: null,
    })),
    resendChallenge: vi.fn(),
    switchMfaMethod: vi.fn(),
    signInWithOAuthProvider: vi.fn(),
    pendingMfaChallenge: null as any,
    pendingMfaEnrollmentSuggestion: null as any,
    signOut: vi.fn(async () => {
      client.emit(AUTH_CHANGE_EVENTS.SIGNED_OUT, unauthenticatedSession(), null);
      return true;
    }),

    // Account management surface.
    listMfaMethods: vi.fn(async () => ({
      data: { methods: [], backup_codes_available: 0, mfa_enabled: false },
      error: null,
    })),
    enrollMfa: vi.fn(),
    verifyMfaEnrollment: vi.fn(),
    removeMfaMethod: vi.fn(),
    generateBackupCodes: vi.fn(),
    listUserSessions: vi.fn(async () => ({ data: [], error: null })),
    revokeSession: vi.fn(),
    updateUserMeta: vi.fn(),
    getUser: vi.fn(async () => ({ data: { user: USER }, error: null })),
    listAlternatePhones: vi.fn(async () => ({ data: { alternate_phones: [] }, error: null })),
    addAlternatePhone: vi.fn(),
    verifyAlternatePhoneChallenge: vi.fn(),
    removeAlternatePhone: vi.fn(),

    ...overrides,
  };
  return client;
}

export function makeWrapper(client: FakeClient, opts: { strict?: boolean } = {}) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const tree = (
      <AuthContextProvider scuteClient={client as any}>{children}</AuthContextProvider>
    );
    return opts.strict ? <StrictMode>{tree}</StrictMode> : tree;
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Drain pending promise chains inside act (works with fake timers too). */
export async function flush(times = 10) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

export function setUrl(pathAndQuery: string) {
  window.history.replaceState(null, "", pathAndQuery);
}
