import type { EngineDecision } from "../types";

type Seen = { method: string; path: string; body: any; auth?: string };

/** A small stand-in for the Scute API endpoints the harness calls. */
export function fakeScute(
  options: {
    decide?: (body: any, seen: Seen[]) => Partial<EngineDecision>;
    ceiling?: string[];
    requestStatus?: string;
    ttlMs?: number;
  } = {}
) {
  const seen: Seen[] = [];
  let tasks = 0;
  const state = {
    requestStatus: options.requestStatus ?? "pending",
    ttlMs: options.ttlMs ?? 30 * 60_000,
    verificationStatus: "pending",
  };

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

  const fetch = (async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const auth = (init.headers as Record<string, string>)?.Authorization;
    const method = init.method ?? "GET";
    seen.push({ method, path, body, auth });

    const secret = auth === "Bearer sk_test";
    const task = auth?.startsWith("Bearer sct_");

    if (method === "POST" && path === "/v1/apps/app1/authz/agents/support-bot/tasks") {
      if (!secret) return json({ error: "Unauthorized" }, 401);
      tasks += 1;
      return json(
        {
          id: `task${tasks}`,
          token: `sct_token${tasks}`,
          agent: "support-bot",
          status: "active",
          acts_for: body.acts_for,
          expires_at: new Date(Date.now() + state.ttlMs).toISOString(),
          chain: ["support-bot"],
        },
        201
      );
    }
    if (method === "POST" && /\/tasks\/[^/]+\/(complete|revoke)$/.test(path)) return json({ status: "done" });
    if (method === "GET" && path === "/v1/auth/app1/agent/whoami") {
      if (!task) return json({ error: "Task token missing" }, 401);
      return json({
        agent: "support-bot",
        task: "task1",
        acts_for: "user1",
        chain: ["support-bot"],
        agent_roles: ["bot"],
        permissions: [],
        ceiling: options.ceiling ?? ["invoice:read", "invoice:refund"],
        step_up: [],
        approval: [],
        actions: null,
        resources: null,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
    }
    if (method === "POST" && path === "/v1/auth/app1/agent/check") {
      if (!task) return json({ error: "Task token missing" }, 401);
      const d = options.decide?.(body, seen) ?? { decision: "allow" };
      const decision = d.decision ?? "allow";
      return json({ allowed: decision === "allow", reason: decision === "allow" ? "role_grant" : "no", ...d });
    }
    if (method === "POST" && path === "/v1/auth/app1/agent/sessions") return json({ id: "sess1", task_id: "task1", verified: false }, 201);
    if (method === "POST" && path === "/v1/auth/app1/agent/sessions/sess1/verified") {
      return body.challenge === "ch_ok"
        ? json({ id: "sess1", verified: true })
        : json({ error: "That challenge doesn't verify this person", error_code: "challenge_invalid" }, 422);
    }
    if (method === "POST" && path === "/v1/auth/app1/agent/verifications") {
      if (!task) return json({ error: "Task token missing" }, 401);
      return json({ token: "ch_ok", status: "pending", method: body.method, expires_at: "", say: "I've emailed a code to a***@example.com. What's the code?" }, 201);
    }
    if (method === "GET" && path === "/v1/auth/app1/agent/verifications/ch_ok") {
      const done = state.verificationStatus === "completed";
      return json({ token: "ch_ok", status: state.verificationStatus, method: "entra_push", say: done ? "Thanks, you're verified." : "Approve it, then tell me." });
    }
    if (method === "POST" && path === "/v1/auth/app1/agent/verifications/ch_ok/code") {
      if (body.code === "123456") {
        state.verificationStatus = "completed";
        return json({ token: "ch_ok", status: "completed", method: "email_otp", say: "Thanks, you're verified." });
      }
      return json({ token: "ch_ok", status: "pending", method: "email_otp", remaining_attempts: 2, error: "Invalid code", say: "That code didn't work. Want to try again?" }, 422);
    }
    if (method === "POST" && path === "/v1/auth/app1/agent/approvals") {
      if (!task) return json({ error: "Task token missing" }, 401);
      return json({ id: "req1", status: state.requestStatus, say: "I've asked for approval. I'll let you know when there's an answer." }, 201);
    }
    if (method === "GET" && path === "/v1/auth/app1/agent/approvals/req1") {
      return json({ id: "req1", status: state.requestStatus, say: state.requestStatus === "approved" ? "It's approved." : "Still waiting." });
    }
    return json({ error: `no route ${method} ${path}` }, 404);
  }) as unknown as typeof globalThis.fetch;

  const paths = (p: string) => seen.filter((s) => s.path === p);
  return { fetch, seen, state, paths };
}

export const base = { agent: "support-bot", appId: "app1", secret: "sk_test", baseUrl: "https://scute.test" };
