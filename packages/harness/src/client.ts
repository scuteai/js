import type { EngineDecision, Resource } from "./types";

export class ScuteHarnessError extends Error {
  /** body: the API's answer, when it sent one. */
  constructor(message: string, readonly status?: number, readonly code?: string, readonly body?: unknown) {
    super(message);
    this.name = "ScuteHarnessError";
  }
}

export type TaskMinted = {
  id: string;
  token: string;
  agent: string;
  status: string;
  acts_for?: string;
  expires_at: string;
  chain: string[];
};

export type Whoami = {
  agent: string;
  task: string;
  acts_for: string | null;
  chain: string[];
  agent_roles: string[];
  /** What the task may do now, app-wide. */
  permissions: string[];
  /** The most the task could ever do (the agent's roles and the task's list). */
  ceiling: string[];
  conditional?: { permission: string; when: string[] }[];
  step_up: string[];
  approval: string[];
  actions: string[] | null;
  resources: string[] | null;
  expires_at: string;
  expires_in?: number;
  /** "expires_soon" when the task has under five minutes left. */
  warnings?: string[];
};

/** A verification an agent started for its person. `say` is ready to speak or write. */
export type Verification = {
  token: string;
  status: "pending" | "completed" | "expired" | "denied" | "failed" | "cancelled";
  method: string;
  expires_at: string;
  remaining_attempts?: number;
  error?: string;
  say: string;
};

/** An approval an agent asked for. Without `id`, nothing was filed (see status). */
export type Approval = {
  id?: string;
  status: "pending" | "approved" | "denied" | "cancelled" | "expired" | "used" | "not_needed" | "verify_first";
  permission?: string;
  resource?: string;
  expires_at?: string;
  say: string;
};

export type AgentSession = { id: string; task_id: string; verified: boolean; verified_at?: string; channel?: string };

type ClientConfig = { appId: string; secret?: string; baseUrl: string; fetch: typeof fetch };

/** The few Scute endpoints the harness talks to. */
export class ScuteClient {
  constructor(private readonly config: ClientConfig) {}

  get canManage() {
    return !!this.config.secret;
  }

  private async call<T>(method: "GET" | "POST", path: string, body: unknown, bearer: string | undefined): Promise<T> {
    if (!bearer) throw new ScuteHarnessError("No credentials for this Scute call", 401, "no_credentials");
    const res = await this.config.fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      throw new ScuteHarnessError(data?.error ?? data?.say ?? `Scute answered ${res.status}`, res.status, data?.error_code, data ?? undefined);
    }
    return data as T;
  }

  private get app() {
    return `/v1/apps/${encodeURIComponent(this.config.appId)}`;
  }

  private get auth() {
    return `/v1/auth/${encodeURIComponent(this.config.appId)}`;
  }

  // Your backend (secret key): tasks

  mintTask(agent: string, body: Record<string, unknown>) {
    return this.call<TaskMinted>("POST", `${this.app}/authz/agents/${encodeURIComponent(agent)}/tasks`, body, this.config.secret);
  }

  closeTask(agent: string, taskId: string, verb: "complete" | "revoke") {
    return this.call<unknown>(
      "POST",
      `${this.app}/authz/agents/${encodeURIComponent(agent)}/tasks/${encodeURIComponent(taskId)}/${verb}`,
      {},
      this.config.secret
    );
  }

  // The agent (task token)

  whoami(token: string) {
    return this.call<Whoami>("GET", `${this.auth}/agent/whoami`, undefined, token);
  }

  check(
    token: string,
    body: { action: string; resource?: Resource; context?: Record<string, unknown>; challenge?: string; approval?: string; session_id?: string }
  ) {
    return this.call<EngineDecision>("POST", `${this.auth}/agent/check`, body, token);
  }

  createSession(token: string, body: { channel?: string; external_ref?: string; caller?: Record<string, unknown> }) {
    return this.call<AgentSession>("POST", `${this.auth}/agent/sessions`, body, token);
  }

  verifySession(token: string, sessionId: string, challenge: string) {
    return this.call<AgentSession>(
      "POST",
      `${this.auth}/agent/sessions/${encodeURIComponent(sessionId)}/verified`,
      { challenge },
      token
    );
  }

  startVerification(token: string, body: { method: string; permission?: string; session_id?: string }) {
    return this.call<Verification>("POST", `${this.auth}/agent/verifications`, body, token);
  }

  verification(token: string, challenge: string) {
    return this.call<Verification>("GET", `${this.auth}/agent/verifications/${encodeURIComponent(challenge)}`, undefined, token);
  }

  submitCode(token: string, challenge: string, code: string) {
    return this.call<Verification>("POST", `${this.auth}/agent/verifications/${encodeURIComponent(challenge)}/code`, { code }, token);
  }

  requestApproval(token: string, body: { action: string; resource?: Resource; reason?: string; context?: Record<string, unknown> }) {
    return this.call<Approval>("POST", `${this.auth}/agent/approvals`, body, token);
  }

  approval(token: string, id: string) {
    return this.call<Approval>("GET", `${this.auth}/agent/approvals/${encodeURIComponent(id)}`, undefined, token);
  }

  endSession(token: string, sessionId: string) {
    return this.call<AgentSession>("POST", `${this.auth}/agent/sessions/${encodeURIComponent(sessionId)}/end`, {}, token);
  }
}
