"use client";

// Headless permission hooks over scute.authz (the signed-in user asking
// about themselves). For showing and hiding UI; your backend still checks
// on the real action.

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthzDecision, AuthzPermissions, AuthzResource } from "@scute/js-core";
import { useAuth, useScuteClient } from "./AuthContext";

type ScuteError = { message: string; code?: string } | null;

export type UseCanResult = {
  /** true only for "allow"; a step-up answer is not allowed yet. */
  allowed: boolean;
  /** The permission needs a fresh verification first (see decision.step_up). */
  needsStepUp: boolean;
  /** The permission needs a reviewer's approval first (see decision.approval). */
  needsApproval: boolean;
  decision: AuthzDecision | null;
  loading: boolean;
  error: ScuteError;
  refetch: () => Promise<void>;
};

const keyOf = (resource?: AuthzResource) =>
  resource === undefined ? "" : typeof resource === "string" ? resource : JSON.stringify(resource);

/**
 * May the signed-in user do `action` (on `resource`)?
 *
 *     const { allowed, needsStepUp } = useCan("edit", `document:${id}`);
 *     return allowed ? <EditButton /> : null;
 *
 * Signed out: not allowed, no request. Re-checks when the user changes.
 */
export function useCan(
  action: string,
  resource?: AuthzResource,
  options: { context?: Record<string, unknown>; enabled?: boolean } = {}
): UseCanResult {
  const scute = useScuteClient();
  const { isAuthenticated, user } = useAuth();
  const [decision, setDecision] = useState<AuthzDecision | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ScuteError>(null);
  const request = useRef(0);
  const enabled = options.enabled !== false;
  const resourceKey = keyOf(resource);
  const contextKey = options.context ? JSON.stringify(options.context) : "";

  const run = useCallback(async () => {
    const id = ++request.current;
    if (!enabled || !isAuthenticated) {
      setDecision(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: err } = await scute.authz.can(action, resource, options.context);
    if (id !== request.current) return; // a newer check started
    setDecision(err ? null : data);
    setError(err ? { message: err.message, code: (err as any).code } : null);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scute, action, resourceKey, contextKey, enabled, isAuthenticated, user?.id]);

  useEffect(() => {
    void run();
  }, [run]);

  return {
    allowed: decision?.decision === "allow",
    needsStepUp: decision?.decision === "allow_with_step_up",
    needsApproval: decision?.decision === "allow_with_approval",
    decision,
    loading,
    error,
    refetch: run,
  };
}

export type UsePermissionsResult = {
  permissions: AuthzPermissions | null;
  /** Holds this permission slug outright ("document:edit"). */
  has: (permission: string) => boolean;
  loading: boolean;
  error: ScuteError;
  refetch: () => Promise<void>;
};

/**
 * Everything the signed-in user can do, app-wide or on one object:
 *
 *     const { has } = usePermissions();
 *     has("billing.export") && <ExportButton />;
 */
export function usePermissions(resource?: string): UsePermissionsResult {
  const scute = useScuteClient();
  const { isAuthenticated, user } = useAuth();
  const [permissions, setPermissions] = useState<AuthzPermissions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ScuteError>(null);
  const request = useRef(0);

  const run = useCallback(async () => {
    const id = ++request.current;
    if (!isAuthenticated) {
      setPermissions(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: err } = await scute.authz.permissions(resource);
    if (id !== request.current) return;
    setPermissions(err ? null : data);
    setError(err ? { message: err.message, code: (err as any).code } : null);
    setLoading(false);
  }, [scute, resource, isAuthenticated, user?.id]);

  useEffect(() => {
    void run();
  }, [run]);

  const has = useCallback(
    (permission: string) => (permissions?.permissions ?? []).indexOf(permission) !== -1,
    [permissions]
  );

  return { permissions, has, loading, error, refetch: run };
}
