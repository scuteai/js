// @ts-nocheck
"use client";

import { useCallback, useEffect, useState } from "react";
import { useScuteClient } from "@scute/react-hooks";
import type { ScuteUserSession } from "@scute/js-core";

export type SessionsErrorCode = "unauthenticated" | "unknown";

export type SessionsResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: SessionsErrorCode; message: string } };

export type RevokeResult = SessionsResult<{}>;

/**
 * Shape returned by useSessions — the active-session list plus revoke + refetch.
 * Pure state and actions; mirrors useAlternatePhones / useUserProfile in style.
 */
export type UseSessionsResult = {
  /** Active sessions for the signed-in user. */
  sessions: ScuteUserSession[];
  /** True while the initial list is loading. */
  loading: boolean;
  /** Last load error, if any. */
  error: string | null;
  /** Re-pull the list from the server. */
  refetch: () => Promise<void>;
  /** Revoke a single session by id. The list is refetched on success. */
  revoke: (id: string | number) => Promise<RevokeResult>;
  /** True if the id matches the currently-active session (i.e. "this device"). */
  isCurrent: (id: string | number) => boolean;
};

const errorMessageFor = (err: unknown, fallback: string): string => {
  const raw = (err as { message?: string; error?: string; json?: { error?: string } })
    ?.json?.error
    || (err as { message?: string })?.message
    || (err as { error?: string })?.error;
  return typeof raw === "string" ? raw : fallback;
};

/**
 * Headless hook for an "Active sessions" account-management section.
 *
 * @example
 * ```tsx
 * "use client";
 * import { useSessions } from "@scute/auth-ui-react";
 *
 * export function SessionsSection() {
 *   const { sessions, loading, revoke, isCurrent } = useSessions();
 *   if (loading) return <p>Loading…</p>;
 *   return (
 *     <ul>
 *       {sessions.map((s) => (
 *         <li key={s.id}>
 *           {s.browser} on {s.platform}{isCurrent(s.id) && " (this device)"}
 *           {!isCurrent(s.id) && (
 *             <button onClick={() => revoke(s.id)}>Sign out</button>
 *           )}
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useSessions(): UseSessionsResult {
  const scuteClient = useScuteClient();
  const [sessions, setSessions] = useState<ScuteUserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await scuteClient.listUserSessions();
      if (res.error) {
        setError(errorMessageFor(res.error, "Failed to load sessions"));
        setSessions([]);
      } else {
        setSessions(res.data || []);
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  }, [scuteClient]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const revoke = useCallback<UseSessionsResult["revoke"]>(
    async (id) => {
      const res = await scuteClient.revokeSession(id);
      if (res.error) {
        return {
          ok: false,
          error: {
            code: "unknown",
            message: errorMessageFor(res.error, "Failed to revoke session"),
          },
        };
      }
      await refetch();
      return { ok: true, data: {} };
    },
    [scuteClient, refetch]
  );

  // The session list returned by the server tags the active one with
  // nickname === "current" (see DetailedAppUserResource and the legacy
  // sessions endpoint). That's what `isCurrent` keys off.
  const isCurrent = useCallback<UseSessionsResult["isCurrent"]>(
    (id) => {
      const match = sessions.find((s) => s.id === id);
      return match?.nickname === "current";
    },
    [sessions]
  );

  return { sessions, loading, error, refetch, revoke, isCurrent };
}
