import type { EngineDecision, Resource } from "./types";

export class ScuteHarnessError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) {
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
      throw new ScuteHarnessError(data?.error ?? `Scute answered ${res.status}`, res.status, data?.error_code);
    }
    return data as T;
  }

  private get app() {
    return `/v1/apps/${encodeURIComponent(this.config.appId)}`;
  }

  private get auth() {
    return `/v1/auth/${encodeURIComponent(this.config.appId)}`;
  }

  // Your backend (secret key)

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

  startChallenge(params: { userId: string; method: string; permission?: string }) {
    return this.call<{ challenge: { token: string; status: string; method: string; expires_at: string } }>(
      "POST",
      `${this.auth}/challenges`,
      {
        purpose: "step_up",
        method: params.method,
        app_user_id: params.userId,
        metadata: params.permission ? { authorizes_action: params.permission } : {},
      },
      this.config.secret
    );
  }

  createRequest(userId: string, body: { action: string; resource?: string; reason?: string }) {
    return this.call<{ id: string; status: string }>("POST", `${this.app}/authz/requests`, { user_id: userId, ...body }, this.config.secret);
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

  endSession(token: string, sessionId: string) {
    return this.call<AgentSession>("POST", `${this.auth}/agent/sessions/${encodeURIComponent(sessionId)}/end`, {}, token);
  }
}
