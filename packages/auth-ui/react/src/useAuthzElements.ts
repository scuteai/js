"use client";

// Headless hooks for embeddable admin screens: your tenant admins manage
// their users' roles, review access requests and read the decision log
// inside your app. Your backend mints a short-lived element token (with the
// users it may see and the roles it may grant); the browser never holds
// your app secret. Bring your own UI.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ScuteElementsApi,
  type AuthzAccessRequest,
  type ElementDecision,
  type ElementRole,
  type ElementUser,
  type ScuteElementsApiConfig,
} from "@scute/js-core";

/** Either connection details, or a ScuteElementsApi you built. */
export type ElementsSource = ScuteElementsApiConfig | { api: ScuteElementsApi };

export type ElementActionResult = { ok: true } | { ok: false; error: { code?: string; message: string } };

const toError = (err: any) => ({
  code: err?.json?.error_code ?? err?.code,
  message: err?.json?.error ?? err?.message ?? "Something went wrong",
});

function useElementsApi(source: ElementsSource): ScuteElementsApi {
  const key = "api" in source ? source.api : `${source.appId}|${source.token}|${source.baseUrl ?? ""}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ("api" in source ? source.api : new ScuteElementsApi(source)), [key]);
}

// Load-on-mount + refetch, dropping answers from superseded loads.
function useLoader<T>(load: () => Promise<{ data: T | null; error: any }>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const refetch = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    const { data: next, error: err } = await load();
    if (id !== request.current) return;
    setData(err ? null : next);
    setError(err ? toError(err).message : null);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export type UseElementUserRolesResult = {
  users: ElementUser[];
  total: number;
  /** Every role of the app, for display. */
  roles: ElementRole[];
  /** Role slugs this token may grant or revoke. */
  assignable: string[];
  loading: boolean;
  error: string | null;
  search: (q: string) => void;
  assign: (userId: string, role: string, expiresAt?: string) => Promise<ElementActionResult>;
  revoke: (userId: string, role: string) => Promise<ElementActionResult>;
  refetch: () => Promise<void>;
};

/** Users in the token's scope with their roles; grant and revoke the assignable ones. */
export function useElementUserRoles(source: ElementsSource): UseElementUserRolesResult {
  const api = useElementsApi(source);
  const [q, setQ] = useState("");
  const users = useLoader(() => api.users({ q }), [api, q]);
  const roles = useLoader(() => api.roles(), [api]);

  const act = useCallback(
    async (call: Promise<{ error: any }>): Promise<ElementActionResult> => {
      const { error } = await call;
      if (error) return { ok: false, error: toError(error) };
      await users.refetch();
      return { ok: true };
    },
    [users.refetch]
  );

  return {
    users: users.data?.users ?? [],
    total: users.data?.total ?? 0,
    roles: roles.data?.roles ?? [],
    assignable: roles.data?.assignable ?? [],
    loading: users.loading || roles.loading,
    error: users.error ?? roles.error,
    search: setQ,
    assign: (userId, role, expiresAt) => act(api.assignRole(userId, role, expiresAt)),
    revoke: (userId, role) => act(api.revokeRole(userId, role)),
    refetch: users.refetch,
  };
}

export type UseElementAccessRequestsResult = {
  requests: AuthzAccessRequest[];
  loading: boolean;
  error: string | null;
  approve: (id: string, note?: string) => Promise<ElementActionResult>;
  deny: (id: string, note?: string) => Promise<ElementActionResult>;
  refetch: () => Promise<void>;
};

/**
 * Pending access requests from users in scope. `kind: "operation"` shows
 * only approvals for single operations; `kind: "role"` only role requests.
 */
export function useElementAccessRequests(
  source: ElementsSource,
  options: { kind?: AuthzAccessRequest["kind"]; status?: AuthzAccessRequest["status"] } = {}
): UseElementAccessRequestsResult {
  const api = useElementsApi(source);
  const loader = useLoader(() => api.requests(options.status ?? "pending"), [api, options.status]);

  const decide = useCallback(
    async (call: Promise<{ error: any }>): Promise<ElementActionResult> => {
      const { error } = await call;
      if (error) return { ok: false, error: toError(error) };
      await loader.refetch();
      return { ok: true };
    },
    [loader.refetch]
  );

  const requests = (loader.data ?? []).filter((r) => !options.kind || r.kind === options.kind);
  return {
    requests,
    loading: loader.loading,
    error: loader.error,
    approve: (id, note) => decide(api.approve(id, note)),
    deny: (id, note) => decide(api.deny(id, note)),
    refetch: loader.refetch,
  };
}

export type UseElementDecisionLogResult = {
  decisions: ElementDecision[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
};

/** Authorization decisions for users in scope, newest first, with paging. */
export function useElementDecisionLog(
  source: ElementsSource,
  filters: { userId?: string; decision?: string } = {}
): UseElementDecisionLogResult {
  const api = useElementsApi(source);
  const [pages, setPages] = useState<ElementDecision[][]>([]);
  const [next, setNext] = useState<string | undefined>();
  const first = useLoader(() => api.decisions(filters), [api, filters.userId, filters.decision]);

  useEffect(() => {
    setPages(first.data ? [first.data.decisions] : []);
    setNext(first.data?.next as string | undefined);
  }, [first.data]);

  const loadMore = useCallback(async () => {
    if (!next) return;
    const { data } = await api.decisions({ ...filters, before: next });
    if (!data) return;
    setPages((p) => [...p, data.decisions]);
    setNext(data.next as string | undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, next, filters.userId, filters.decision]);

  return {
    decisions: pages.flat(),
    loading: first.loading,
    error: first.error,
    hasMore: !!next,
    loadMore,
    refetch: first.refetch,
  };
}
