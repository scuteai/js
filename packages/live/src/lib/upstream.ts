// An MCP server that lives in this process, for the gateway to sit in front
// of. It never listens on a port: the gateway gets a fetch that hands
// requests for the upstream URL to `handle` and sends everything else (Scute)
// over the network.

export type UpstreamTool = { name: string; description: string; inputSchema: Record<string, unknown> };

export class FakeUpstream {
  readonly calls: { tool: string; args: Record<string, unknown>; authorization: string | null }[] = [];
  readonly methods: string[] = [];

  constructor(readonly url: string, readonly tools: UpstreamTool[]) {}

  handle = async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return new Response(null, { status: 405 });
    const msg = (await req.json()) as { id?: number | string; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
    this.methods.push(String(msg.method));
    const reply = (result: unknown) =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: msg.id ?? null, result }), {
        status: 200,
        headers: { "content-type": "application/json", "mcp-session-id": "upstream-session" },
      });

    switch (msg.method) {
      case "initialize":
        return reply({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "live-upstream", version: "1.0" } });
      case "tools/list":
        return reply({ tools: this.tools });
      case "tools/call": {
        const tool = String(msg.params?.name);
        const args = msg.params?.arguments ?? {};
        this.calls.push({ tool, args, authorization: req.headers.get("authorization") });
        return reply({ content: [{ type: "text", text: `upstream ran ${tool} ${JSON.stringify(args)}` }] });
      }
      default:
        if (msg.id === undefined) return new Response(null, { status: 202 });
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
    }
  };

  /** A fetch that answers the upstream URL here and passes the rest through. */
  fetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === this.url || url.startsWith(`${this.url}?`)) {
      return this.handle(new Request(url, init));
    }
    return fetch(input, init);
  };
}
