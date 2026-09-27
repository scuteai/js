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

export function createFakeClient(overrides: Record<string, unknown> = {}) {
  const listeners = new Set<Listener>();
  const unsubscribes: Array<ReturnType<typeof vi.fn>> = [];

  const client: any = {
    listeners,
    unsubscribes,
    onAuthStateChange: vi.fn((cb: Listener) => {
      listeners.add(cb);
      const unsubscribe = vi.fn(() => {
        listeners.delete(cb);
      });
      unsubscribes.push(unsubscribe);
      return unsubscribe;
    }),
    /**
     * Mirrors ScuteClient.onAuthStateChange: an event emitted without a
     * session reaches listeners as the unauthenticated state + null user.
     */
    emit(event: string, session?: any, user?: any) {
      for (const cb of [...listeners]) {
        cb(event, session ?? unauthenticatedSession(), user ?? null);
      }
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
    // Like the real client: stores the session, emits SIGNED_IN, returns { error: null }.
    signInWithTokenPayload: vi.fn(async (payload: any) => {
      client.emit(
        AUTH_CHANGE_EVENTS.SIGNED_IN,
        authenticatedSession(payload?.access ?? ACCESS_TOKEN),
        USER
      );
      return { error: null };
    }),
    signInOrUp: vi.fn(async () => ({ data: null, error: null })),
    getMagicLinkStatus: vi.fn(async () => ({ data: null, error: { message: "pending" } })),
    verifyOtp: vi.fn(),
    verifyMfaChallenge: vi.fn(),
    addDevice: vi.fn(async () => ({ data: { id: "cred_1" }, error: null })),
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
