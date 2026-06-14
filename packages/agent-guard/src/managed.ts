import { FetchLike } from "./adapters/ScuteVerifier";

/** Worker-ready agent config from GET /agents/:id/config (M03). */
export interface ManagedAgentConfig {
  id: string;
  name: string;
  model?: string;
  system_prompt?: string;
  capabilities: string[];
  tools: { name: string; json_schema: any; required_permission?: string | null }[];
  guard_url: string;
}

export interface ManagedClientOptions {
  baseUrl: string;
  appId: string;
  agentId: string;
  /** the agent's own M2M token */
  token: string;
  fetchImpl?: FetchLike;
}

function fetcher(opts: ManagedClientOptions): FetchLike {
  return opts.fetchImpl || ((globalThis as any).fetch as FetchLike);
}

function base(opts: ManagedClientOptions): string {
  return `${opts.baseUrl.replace(/\/+$/, "")}/v1/auth/${opts.appId}/agents/${opts.agentId}`;
}

/**
 * A managed worker fetches its config at startup and runs the loop data-driven.
 * One worker codebase serves any agent. Returns null if the config can't be read.
 */
export async function loadAgentConfig(
  opts: ManagedClientOptions
): Promise<ManagedAgentConfig | null> {
  const res = await fetcher(opts)(`${base(opts)}/config`, {
    headers: { "X-Authorization": `Bearer ${opts.token}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as ManagedAgentConfig;
}

export interface ManagedToolResult {
  ok: boolean;
  decision: string;
  output?: unknown;
  message?: string;
}

/**
 * Run a tool through the HOSTED guard endpoint: Scute gates (RBAC + verification)
 * and forwards allowed calls to the customer webhook, server-side. The worker
 * never decides authorization itself.
 */
export async function callManagedTool(
  opts: ManagedClientOptions,
  toolName: string,
  args: Record<string, unknown>
): Promise<ManagedToolResult> {
  const res = await fetcher(opts)(`${base(opts)}/guard`, {
    method: "POST",
    headers: {
      "X-Authorization": `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tool: toolName, args }),
  });
  let body: any = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  return {
    ok: res.ok && body.decision === "allowed",
    decision: body.decision || (res.ok ? "allowed" : "blocked_rbac"),
    output: body.result,
    message: body.error,
  };
}
