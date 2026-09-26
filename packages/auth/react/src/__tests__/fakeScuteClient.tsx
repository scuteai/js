// Test-only helpers: a fake ScuteClient that mirrors the parts of the real
// client these hooks touch, plus a provider wrapper. Not a test file itself
// (vitest only collects *.test.ts[x]).

import type { ReactNode } from "react";
import { vi } from "vitest";
import { AUTH_CHANGE_EVENTS } from "@scute/js-core";
import { AuthContextProvider } from "../AuthContext";

export type Listener = (event: string, session: any, user: any) => unknown;

export const unauthenticatedSession = () => ({
  access: null,
  accessExpiresAt: null,
  refresh: null,
  refreshExpiresAt: null,
  status: "unauthenticated" as const,
});

export const authenticatedSession = (access = "access.jwt.AAA") => ({
  access,
  accessExpiresAt: new Date("2030-01-01T00:00:00Z"),
  refresh: "refresh.jwt.RRR",
  refreshExpiresAt: new Date("2030-02-01T00:00:00Z"),
  status: "authenticated" as const,
});

export const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: "usr_1",
  email: "ada@example.com",
  phone: null,
  ...overrides,
});

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
     * session is delivered to listeners as the unauthenticated state with a
     * null user (see `callback(event, session ?? sessionUnAuthenticatedState(), user ?? null)`).
     */
    emit(event: string, session?: any, user?: any) {
      for (const cb of [...listeners]) {
        cb(event, session ?? unauthenticatedSession(), user ?? null);
      }
    },
    signOut: vi.fn(async () => {
      client.emit(AUTH_CHANGE_EVENTS.SIGNED_OUT, unauthenticatedSession(), null);
      return true;
    }),
    pendingMfaChallenge: null as any,
    enrollMfa: vi.fn(),
    verifyMfaEnrollment: vi.fn(),
    verifyMfaChallenge: vi.fn(),
    switchMfaMethod: vi.fn(),
    resendChallenge: vi.fn(),
    cancelChallenge: vi.fn(),
    listMfaMethods: vi.fn(async () => ({
      data: { methods: [], backup_codes_available: 0, mfa_enabled: false },
      error: null,
    })),
    removeMfaMethod: vi.fn(),
    setDefaultMfaMethod: vi.fn(),
    generateBackupCodes: vi.fn(),
    ...overrides,
  };
  return client;
}

export function makeWrapper(client: FakeClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthContextProvider scuteClient={client as any}>
        {children}
      </AuthContextProvider>
    );
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
