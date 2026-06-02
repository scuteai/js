// @ts-nocheck
"use client";

import { useCallback, useState } from "react";
import { useAuth, useScuteClient } from "@scute/react-hooks";
import type { ScuteUserData, UserMeta } from "@scute/js-core";

export type UpdateMetaResult =
  | { ok: true }
  | { ok: false; error: { code: "validation_error" | "unknown"; message: string; fieldErrors?: Record<string, string> } };

/**
 * Shape returned by useUserProfile — the canonical view of "the signed-in
 * user" plus the actions an account-management surface needs.
 *
 * Wraps useAuth() so callers don't juggle multiple hooks. The session and
 * sign-out behaviour passes straight through; updateMeta and refetch are
 * the headless counterparts for the things a profile page typically does.
 */
export type UseUserProfileResult = {
  /** The signed-in user, or null if the session is loading / signed out. */
  user: ScuteUserData | null;
  /** True until the SDK has resolved the initial session. */
  isLoading: boolean;
  /** True when a valid session is present. */
  isAuthenticated: boolean;
  /** True while updateMeta is in flight. */
  isUpdating: boolean;
  /** Last updateMeta error, if any. */
  error: string | null;

  /** Re-pull the user from the server (post-mutation refresh). */
  refetch: () => Promise<void>;

  /**
   * Update the user's custom meta fields. Returns ok:true on success or
   * ok:false with structured error info on validation failure.
   */
  updateMeta: (meta: UserMeta) => Promise<UpdateMetaResult>;

  /** End the current session and return to the unauthenticated state. */
  signOut: () => Promise<void>;
};

const errorMessageFor = (err: unknown, fallback: string): string => {
  const raw = (err as { message?: string; error?: string; json?: { error?: string } })
    ?.json?.error
    || (err as { message?: string })?.message
    || (err as { error?: string })?.error;
  return typeof raw === "string" ? raw : fallback;
};

/**
 * Headless hook for an account-management page. Pairs with
 * useAlternatePhones for the phones section; future profile sections
 * (passkeys, sessions, MFA) will mount alongside under the same hook
 * naming so a real account UI can be a flat list of section components,
 * each owning its own hook.
 *
 * @example
 * ```tsx
 * "use client";
 * import { useUserProfile } from "@scute/auth-ui-react";
 *
 * export function ProfileCard() {
 *   const { user, isLoading, signOut } = useUserProfile();
 *   if (isLoading) return <p>Loading…</p>;
 *   if (!user) return <p>Signed out.</p>;
 *   return (
 *     <div>
 *       <p>{user.email}</p>
 *       <p>{user.phone}</p>
 *       <button onClick={signOut}>Sign out</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useUserProfile(): UseUserProfileResult {
  const scuteClient = useScuteClient();
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    // Force a fresh fetch from the server, then re-emit the session so the
    // AuthContextProvider re-renders with the new user.
    await scuteClient.getUser?.();
  }, [scuteClient]);

  const updateMeta = useCallback<UseUserProfileResult["updateMeta"]>(
    async (meta) => {
      setIsUpdating(true);
      setError(null);
      try {
        const res = await scuteClient.updateUserMeta(meta);
        if (res.error) {
          const message = errorMessageFor(res.error, "Failed to update profile");
          setError(message);
          // Surface per-field errors if the API returned them. The Rails side
          // returns user_meta validation errors as an array of { key, message };
          // we normalize that to a flat record.
          const fieldErrorsRaw = (res.error as { json?: { errors?: Array<{ key?: string; message?: string }> } })
            ?.json?.errors;
          const fieldErrors = Array.isArray(fieldErrorsRaw)
            ? Object.fromEntries(
                fieldErrorsRaw
                  .filter((e) => e?.key && e?.message)
                  .map((e) => [e.key as string, e.message as string])
              )
            : undefined;
          return {
            ok: false,
            error: { code: fieldErrors ? "validation_error" : "unknown", message, fieldErrors },
          };
        }
        await refetch();
        return { ok: true };
      } finally {
        setIsUpdating(false);
      }
    },
    [scuteClient, refetch]
  );

  const wrappedSignOut = useCallback(async () => {
    await signOut?.();
  }, [signOut]);

  return {
    user: user ?? null,
    isAuthenticated,
    isLoading,
    isUpdating,
    error,
    refetch,
    updateMeta,
    signOut: wrappedSignOut,
  };
}
