// @ts-nocheck
"use client";

import { useCallback, useEffect, useState } from "react";
import { useScuteClient } from "@scute/react-hooks";

/**
 * One alternate-phone entry as returned by the API.
 */
export type AlternatePhone = {
  phone: string;
  label?: string | null;
  verified_at?: string | null;
  usable_for_login?: boolean;
};

/**
 * Application-defined error code returned by the API. The integrator can
 * branch on these to render specific messages without string-matching.
 *
 * - `invalid_phone`              — input couldn't be parsed as a phone
 * - `phone_is_canonical`         — phone equals the user's canonical number
 * - `phone_already_registered`   — phone is already on the alternates list
 * - `alternate_phone_cap_exceeded` — per-user cap reached (5)
 * - `alternate_phone_not_found`  — remove target wasn't on the list
 * - `unknown`                    — anything else (network, server)
 */
export type AlternatePhoneErrorCode =
  | "invalid_phone"
  | "phone_is_canonical"
  | "phone_already_registered"
  | "alternate_phone_cap_exceeded"
  | "alternate_phone_not_found"
  | "unknown";

export type AlternatePhonesResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AlternatePhoneErrorCode; message: string } };

export type AddResult = AlternatePhonesResult<{
  challengeToken: string;
  phone: string;
}>;

export type VerifyResult = AlternatePhonesResult<{}>;

export type RemoveResult = AlternatePhonesResult<{}>;

/**
 * Shape returned by useAlternatePhones — all state and actions the
 * integrator's UI needs to render a verified-alternate-phones manager.
 *
 * Actions are pure functions (no internal multi-step state machine) so the
 * integrator owns dialog/wizard state. If you want a higher-level wizard,
 * compose this hook in your own.
 */
export type UseAlternatePhonesResult = {
  /** Current verified entries on the user's account. */
  phones: AlternatePhone[];
  /** True while the initial list is loading. */
  loading: boolean;
  /** Last load/refetch error, if any. Null when healthy. */
  error: string | null;
  /** Re-fetch the list. */
  refetch: () => Promise<void>;

  /**
   * Step 1: kick off registration. Server sends an SMS OTP to `phone`.
   * The phone is NOT yet persisted — only the returned challenge token is.
   */
  add: (phone: string, label?: string) => Promise<AddResult>;

  /**
   * Step 2: submit the SMS code that was sent. On success the entry lands
   * on the user row and the local list is refetched.
   */
  verify: (challengeToken: string, code: string) => Promise<VerifyResult>;

  /** Remove a verified entry. No re-verification required. */
  remove: (phone: string) => Promise<RemoveResult>;
};

const errorCodeFor = (err: unknown): AlternatePhoneErrorCode => {
  // SDK errors come back as { code, message } from render_json_error on the
  // API side. We sniff a few well-known slugs; anything else collapses to
  // "unknown" so the integrator can render a generic fallback.
  const code = (err as { code?: string; error_code?: string; json?: { error_code?: string } })
    ?.json?.error_code
    || (err as { code?: string })?.code
    || (err as { error_code?: string })?.error_code;

  switch (code) {
    case "invalid_phone":
    case "phone_is_canonical":
    case "phone_already_registered":
    case "alternate_phone_cap_exceeded":
    case "alternate_phone_not_found":
      return code;
    default:
      return "unknown";
  }
};

const errorMessageFor = (err: unknown, fallback: string): string => {
  const raw = (err as { message?: string; error?: string; json?: { error?: string } })
    ?.json?.error
    || (err as { message?: string })?.message
    || (err as { error?: string })?.error;
  return typeof raw === "string" ? raw : fallback;
};

/**
 * Headless hook for managing a user's verified alternate phone numbers.
 *
 * Mirrors the layered shape of `useScuteAuthFlow` — returns state + actions
 * with zero UI opinions. Compose into whatever component shape you want.
 *
 * @example
 * ```tsx
 * "use client";
 * import { useState } from "react";
 * import { useAlternatePhones } from "@scute/auth-ui-react";
 *
 * export function AlternatePhonesSection() {
 *   const { phones, loading, add, verify, remove } = useAlternatePhones();
 *   const [pending, setPending] = useState<{ token: string; phone: string } | null>(null);
 *   const [phone, setPhone] = useState("");
 *   const [code, setCode] = useState("");
 *
 *   if (loading) return <p>Loading…</p>;
 *   return (
 *     <div>
 *       <ul>
 *         {phones.map((p) => (
 *           <li key={p.phone}>
 *             {p.phone}
 *             <button onClick={() => remove(p.phone)}>Remove</button>
 *           </li>
 *         ))}
 *       </ul>
 *       {pending ? (
 *         <form
 *           onSubmit={async (e) => {
 *             e.preventDefault();
 *             const res = await verify(pending.token, code);
 *             if (res.ok) setPending(null);
 *           }}
 *         >
 *           Code sent to {pending.phone}.
 *           <input value={code} onChange={(e) => setCode(e.target.value)} />
 *         </form>
 *       ) : (
 *         <form
 *           onSubmit={async (e) => {
 *             e.preventDefault();
 *             const res = await add(phone);
 *             if (res.ok) setPending({ token: res.data.challengeToken, phone: res.data.phone });
 *           }}
 *         >
 *           <input value={phone} onChange={(e) => setPhone(e.target.value)} />
 *         </form>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useAlternatePhones(): UseAlternatePhonesResult {
  const scuteClient = useScuteClient();
  const [phones, setPhones] = useState<AlternatePhone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await scuteClient.listAlternatePhones();
      if (res.error) {
        setError(errorMessageFor(res.error, "Failed to load alternate phones"));
        setPhones([]);
      } else {
        setPhones(res.data?.alternate_phones || []);
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  }, [scuteClient]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const add = useCallback<UseAlternatePhonesResult["add"]>(
    async (phone, label) => {
      const res = await scuteClient.addAlternatePhone(phone, label);
      if (res.error || !res.data?.challenge_token) {
        return {
          ok: false,
          error: {
            code: errorCodeFor(res.error),
            message: errorMessageFor(res.error, "Failed to start registration"),
          },
        };
      }
      return {
        ok: true,
        data: {
          challengeToken: res.data.challenge_token,
          phone: res.data.phone,
        },
      };
    },
    [scuteClient]
  );

  const verify = useCallback<UseAlternatePhonesResult["verify"]>(
    async (challengeToken, code) => {
      const res = await scuteClient.verifyAlternatePhoneChallenge(
        challengeToken,
        code
      );
      if (res.error) {
        return {
          ok: false,
          error: {
            code: errorCodeFor(res.error),
            message: errorMessageFor(res.error, "Verification failed"),
          },
        };
      }
      await refetch();
      return { ok: true, data: {} };
    },
    [scuteClient, refetch]
  );

  const remove = useCallback<UseAlternatePhonesResult["remove"]>(
    async (phone) => {
      const res = await scuteClient.removeAlternatePhone(phone);
      if (res.error) {
        return {
          ok: false,
          error: {
            code: errorCodeFor(res.error),
            message: errorMessageFor(res.error, "Failed to remove"),
          },
        };
      }
      await refetch();
      return { ok: true, data: {} };
    },
    [scuteClient, refetch]
  );

  return { phones, loading, error, refetch, add, verify, remove };
}
