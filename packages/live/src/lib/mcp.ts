// A minimal MCP client over Streamable HTTP with plain fetch and JSON
// responses: what a voice or chat platform does when it connects to
// Scute's auth MCP server. No SDK wraps this; it's the protocol itself.

export type RpcAnswer<T = any> = { status: number; result?: T; error?: { code: number; message: string } };

export type ToolResult<T = Record<string, any>> = {
  isError: boolean;
  structuredContent: T;
  text: string;
};

export const PROTOCOL_VERSION = "2025-06-18";

export class McpHttpClient {
  sessionId?: string;
  private nextId = 1;

  constructor(
    private readonly url: string,
    private readonly bearer: string,
    private readonly extraHeaders: Record<string, string> = {},
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.bearer}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
      ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
      ...this.extraHeaders,
    };
  }

  async request<T = any>(method: string, params?: Record<string, unknown>): Promise<RpcAnswer<T>> {
    const id = this.nextId++;
    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
    });
    const session = res.headers.get("mcp-session-id");
    if (session) this.sessionId = session;
    const text = await res.text();
    const body = parseRpc(text, res.headers.get("content-type") ?? "");
    return { status: res.status, result: body?.result as T | undefined, error: body?.error };
  }

  async notify(method: string, params?: Record<string, unknown>): Promise<number> {
    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", method, ...(params ? { params } : {}) }),
    });
    await res.text();
    return res.status;
  }

  async initialize() {
    return this.request<{ protocolVersion: string; serverInfo: { name: string }; capabilities: Record<string, unknown> }>("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "scute-live-tests", version: "1.0" },
    });
  }

  async listTools() {
    return this.request<{ tools: { name: string; description?: string; inputSchema?: unknown }[] }>("tools/list", {});
  }

  async callTool<T = Record<string, any>>(name: string, args: Record<string, unknown> = {}): Promise<ToolResult<T> & { status: number }> {
    const answer = await this.request<{ content?: { type: string; text?: string }[]; structuredContent?: T; isError?: boolean }>(
      "tools/call",
      { name, arguments: args }
    );
    if (answer.error) throw new Error(`tools/call ${name}: JSON-RPC error ${answer.error.code}: ${answer.error.message}`);
    const r = answer.result ?? {};
    const text = (r.content ?? []).map((c) => c.text ?? "").join("\n");
    return { status: answer.status, isError: r.isError === true, structuredContent: (r.structuredContent ?? {}) as T, text };
  }

  /** DELETE: the client ends the conversation. */
  async close(): Promise<number> {
    const res = await this.fetchImpl(this.url, { method: "DELETE", headers: this.headers() });
    await res.text();
    return res.status;
  }
}

/** A JSON-RPC message from a JSON body or the last `data:` line of an SSE body. */
export function parseRpc(text: string, contentType: string): { result?: unknown; error?: { code: number; message: string } } | null {
  if (!text) return null;
  try {
    if (contentType.includes("text/event-stream")) {
      const data = text
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .pop();
      return data ? JSON.parse(data) : null;
    }
    return JSON.parse(text);
  } catch {
    return null;
  }
}
