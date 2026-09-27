"use client";

// RB-49: when someone (support) is signed in as the user. For a banner:
// "You're signed in as Alice (support@acme.test), until 14:30. Stop".

import { useCallback, useMemo, useState } from "react";
import { decodeImpersonation, type ScuteImpersonationActor } from "@scute/js-core";
import { useAuth, useScuteClient } from "./AuthContext";

export type UseImpersonationResult = {
  impersonating: boolean;
  /** Who is really acting (from the token's act claim). */
  actor: ScuteImpersonationActor | null;
  /** When the session ends on its own; it is never refreshed. */
  expiresAt: Date | null;
  /** End it and bring back the support person's own session, if one was kept. */
  stop: () => Promise<boolean>;
  stopping: boolean;
};

export function useImpersonation(): UseImpersonationResult {
  const scute = useScuteClient();
  const { session } = useAuth();
  const [stopping, setStopping] = useState(false);
  const access = session.status === "authenticated" ? session.access : null;
  const current = useMemo(() => decodeImpersonation(access), [access]);

  const stop = useCallback(async () => {
    setStopping(true);
    try {
      return await scute.stopImpersonating();
    } finally {
      setStopping(false);
    }
  }, [scute]);

  return {
    impersonating: !!current,
    actor: current?.actor ?? null,
    expiresAt: current?.expiresAt ?? null,
    stop,
    stopping,
  };
}
