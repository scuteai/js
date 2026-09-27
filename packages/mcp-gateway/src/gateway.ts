import { createHarness, modelMessage, type Guard, type Harness, type Mode, type Run, type Store, type ToolsConfig } from "@scute/harness";
import { Jwks, verifyAccessToken, type AccessTokenClaims } from "./jwt";
import { toolHash, type McpTool } from "./pins";
import { formatSse, parseSse, type SseEvent } from "./sse";

export type GatewayConfig = {
  /** Your Scute app (id or public id). Default: SCUTE_APP_ID. */
  appId?: string;
  /** Your app's secret key: trades user tokens for task tokens and reports tools. Default: SCUTE_SECRET. */
  secret?: string;
  /** Default: SCUTE_BASE_URL, then https://api.scute.io. */
  baseUrl?: string;
  /**
   * This gateway's public MCP URL, exactly as registered in Scute under
   * MCP sign-in > MCP servers (the token audience), e.g. https://mcp.acme.io/mcp.
   */
  resource: string;
  /** The MCP server you put behind the gateway (Streamable HTTP), and how the gateway authenticates to it. */
  upstream: { url: string; headers?: Record<string, string> };
  /** Harness guards run on every tool call. Default: [guards.permissions()]. */
  guards?: Guard[];
  tools?: ToolsConfig;
  mode?: Mode;
  store?: Store;
  /** Hold new or changed tool definitions for review in Scute. Default true. */
  pinning?: boolean;
  /** tools/list shows only tools the task could ever use. Default true. */
  hideUnavailable?: boolean;
  /** Shown to MCP clients in the protected resource metadata. */
  resourceName?: string;
  /** Tell the model to use scute_verify_person and friends (when the upstream offers them). */
  humanTools?: boolean;
  fetch?: typeof fetch;
};

type RpcMessage = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown> & { name?: unknown; arguments?: unknown; _meta?: Record<string, unknown> };
  result?: unknown;
  error?: unknown;
};

type AsMetadata = { issuer: string; jwks_uri: string; scopes_supported?: string[] };

type Session = {
  harness: Harness;
  run: Run;
  scopes: string[];
  scopeActions?: Record<string, string[]>;
  expiresAt: number;
};

type Caller = { claims: AccessTokenClaims; token: string };

const env = (name: string): string | undefined =>
  typeof process !== "undefined" && process.env ? process.env[name] || undefined : undefined;

const MAX_BODY = 5_000_000;
const TOKEN_EXCHANGE = "urn:ietf:params:oauth:grant-type:token-exchange";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";
const FORWARD_HEADERS = ["accept", "content-type", "mcp-session-id", "mcp-protocol-version", "last-event-id", "traceparent", "tracestate"];

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const toolError = (text: string) => ({ content: [{ type: "text", text }], isError: true });

/** The resource URL as Scute stores it: lowercase host, no default port, no bare "/". */
export function canonicalResource(raw: string): string {
  const u = new URL(raw);
  const path = u.pathname === "/" ? "" : u.pathname;
  return `${u.protocol}//${u.host}${path}${u.search}`;
}

/**
 * An MCP gateway: users of your app sign in to it through Scute (OAuth 2.1),
 * every tool call runs through your harness guards with the user's task,
 * and tool definitions are pinned. A standard fetch handler:
 * `(request: Request) => Promise<Response>`.
 */
export class McpGateway {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly appId: string;
  private readonly secret?: string;
  private readonly resourceUrl: URL;
  private readonly resource: string;
  private readonly expiries = new Map<string, number>();
  private meta?: AsMetadata;
  private metaAt = 0;
  private jwks?: Jwks;
  private readonly sessions = new Map<string, Promise<Session>>();
  private readonly harnesses = new Map<string, Harness>();
  private quarantined = new Set<string>();
  private resourceId?: string;
  private lastReport = "";

  constructor(readonly config: GatewayConfig) {
    const appId = config.appId ?? env("SCUTE_APP_ID");
    if (!appId) throw new Error("The MCP gateway needs an app id: pass `appId` or set SCUTE_APP_ID");
    if (!config.resource) throw new Error("The MCP gateway needs `resource`: its public MCP URL");
    if (!config.upstream?.url) throw new Error("The MCP gateway needs `upstream.url`: the MCP server behind it");
    const fetchImpl = config.fetch ?? (typeof fetch !== "undefined" ? fetch : undefined);
    if (!fetchImpl) throw new Error("No fetch available; pass `fetch` (Node 18+ has one built in)");
    this.fetchImpl = fetchImpl;
    this.appId = appId;
    this.secret = config.secret ?? env("SCUTE_SECRET");
    this.baseUrl = (config.baseUrl ?? env("SCUTE_BASE_URL") ?? "https://api.scute.io").replace(/\/+$/, "");
    this.resource = canonicalResource(config.resource);
    this.resourceUrl = new URL(this.resource);
  }

  /** The fetch handler. */
  handle = async (req: Request): Promise<Response> => {
    try {
      const path = new URL(req.url).pathname;
      if (req.method === "GET" && this.isMetadataPath(path)) return json(await this.resourceMetadata());
      if (path !== this.resourceUrl.pathname) return new Response("Not found", { status: 404 });

      const caller = await this.authenticate(req);
      if (caller instanceof Response) return caller;
      if (req.method === "POST") return await this.post(req, caller);
      if (req.method === "GET" || req.method === "DELETE") return await this.forward(req, undefined);
      return new Response(null, { status: 405, headers: { allow: "GET, POST, DELETE" } });
    } catch (e) {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: `Gateway error: ${(e as Error).message}` } }, 502);
    }
  };

  // ── Discovery and sign-in ─────────────────────────────────────────────────

  private metadataUrl(): string {
    const path = this.resourceUrl.pathname === "/" ? "" : this.resourceUrl.pathname;
    return `${this.resourceUrl.origin}/.well-known/oauth-protected-resource${path}`;
  }

  private isMetadataPath(path: string): boolean {
    const suffix = this.resourceUrl.pathname === "/" ? "" : this.resourceUrl.pathname;
    return path === `/.well-known/oauth-protected-resource${suffix}` || path === "/.well-known/oauth-protected-resource";
  }

  /** RFC 9728: where MCP clients learn which authorization server to use. */
  private async resourceMetadata() {
    const meta = await this.asMetadata();
    return {
      resource: this.resource,
      authorization_servers: [meta.issuer],
      scopes_supported: meta.scopes_supported,
      bearer_methods_supported: ["header"],
      resource_name: this.config.resourceName,
    };
  }

  private async asMetadata(): Promise<AsMetadata> {
    if (this.meta && Date.now() - this.metaAt < 3_600_000) return this.meta;
    const res = await this.fetchImpl(`${this.baseUrl}/v1/oauth/${encodeURIComponent(this.appId)}/.well-known/oauth-authorization-server`);
    if (!res.ok) throw new Error(`Scute's OAuth server isn't available for this app (${res.status}); turn it on under MCP sign-in`);
    const meta = (await res.json()) as AsMetadata;
    if (!this.jwks || this.meta?.jwks_uri !== meta.jwks_uri) this.jwks = new Jwks(meta.jwks_uri, this.fetchImpl);
    this.meta = meta;
    this.metaAt = Date.now();
    return meta;
  }

  private unauthorized(error?: string, description?: string): Response {
    const params = [`resource_metadata="${this.metadataUrl()}"`];
    if (error) params.unshift(`error="${error}"`);
    if (description) params.push(`error_description="${description.replace(/"/g, "'")}"`);
    return json({ error: error ?? "unauthorized", error_description: description ?? "Sign in to use this MCP server" }, 401,
      { "www-authenticate": `Bearer ${params.join(", ")}` });
  }

  private async authenticate(req: Request): Promise<Caller | Response> {
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
    if (!match) return this.unauthorized();
    const meta = await this.asMetadata();
    const claims = await verifyAccessToken(match[1], { jwks: this.jwks!, issuer: meta.issuer, audience: this.resource });
    if (!claims) return this.unauthorized("invalid_token", "The access token is invalid, expired or for another server");
    return { claims, token: match[1] };
  }

  // ── The user's task ───────────────────────────────────────────────────────

  private session(caller: Caller): Promise<Session> {
    const key = caller.claims.jti ?? caller.token;
    if (this.sessions.size > 500) {
      // Drop sessions whose token has expired, so the map doesn't grow.
      const now = Date.now();
      for (const [k, at] of this.expiries) if (at < now) { this.expiries.delete(k); this.sessions.delete(k); }
    }
    let session = this.sessions.get(key);
    if (!session) {
      session = this.startSession(caller);
      this.sessions.set(key, session);
      session.then((v) => this.expiries.set(key, v.expiresAt), () => this.sessions.delete(key));
    }
    return session;
  }

  /** RFC 8693: trade the user's access token for a task token of the client's agent. */
  private async startSession(caller: Caller): Promise<Session> {
    if (!this.secret) throw new Error("The gateway needs the app's secret key (SCUTE_SECRET) to start tasks");
    const res = await this.fetchImpl(`${this.baseUrl}/v1/oauth/${encodeURIComponent(this.appId)}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Bearer ${this.secret}` },
      body: new URLSearchParams({ grant_type: TOKEN_EXCHANGE, subject_token: caller.token, subject_token_type: ACCESS_TOKEN_TYPE,
        resource: this.resource }).toString(),
    });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string; agent?: string; expires_in?: number; scope?: string; scope_actions?: Record<string, string[]>;
      error?: string; error_description?: string;
    };
    if (!res.ok || !body.access_token || !body.agent) {
      throw new Error(body.error_description ?? body.error ?? `token exchange failed (${res.status})`);
    }
    const harness = this.harnessFor(body.agent);
    const run = harness.run({ id: `mcp:${caller.claims.jti ?? caller.claims.sub}`, token: body.access_token, actsFor: caller.claims.sub });
    return {
      harness, run,
      scopes: (body.scope ?? caller.claims.scope ?? "").split(" ").filter(Boolean),
      scopeActions: body.scope_actions,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    };
  }

  private harnessFor(agent: string): Harness {
    let h = this.harnesses.get(agent);
    if (!h) {
      h = createHarness({ agent, appId: this.appId, baseUrl: this.baseUrl, guards: this.config.guards, tools: this.config.tools,
        mode: this.config.mode, store: this.config.store, fetch: this.fetchImpl });
      this.harnesses.set(agent, h);
    }
    return h;
  }

  // ── JSON-RPC ──────────────────────────────────────────────────────────────

  private async post(req: Request, caller: Caller): Promise<Response> {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
    }
    if (Array.isArray(body)) {
      if (body.some((m) => typeof m?.method === "string" && m.method.startsWith("tools/"))) {
        return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Send tools/* requests one at a time" } }, 400);
      }
      return this.forward(req, text);
    }
    const msg = body as RpcMessage;
    if (msg.method === "tools/call") return this.toolsCall(req, msg, caller);
    if (msg.method === "tools/list") return this.toolsList(req, msg, text, caller);
    return this.forward(req, text);
  }

  private async toolsCall(req: Request, msg: RpcMessage, caller: Caller): Promise<Response> {
    const name = msg.params?.name;
    if (typeof name !== "string") return json({ jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32602, message: "tools/call needs a tool name" } });
    const args = (msg.params?.arguments && typeof msg.params.arguments === "object" ? msg.params.arguments : {}) as Record<string, unknown>;

    if (this.config.pinning !== false && this.quarantined.has(name)) {
      return this.rpcResult(msg, toolError(`${name} is new or changed and is held for review in Scute. Don't retry it; tell the person.`));
    }

    let session: Session;
    try {
      session = await this.session(caller);
    } catch (e) {
      return this.rpcResult(msg, toolError(`Scute couldn't start a task for this client: ${(e as Error).message}`));
    }

    const verdict = await session.run.check(name, args);
    if (verdict.kind !== "proceed" && verdict.kind !== "transform") {
      const needed = verdict.kind === "deny" && verdict.decision.reason === "outside_task" ? this.missingScope(session, name) : undefined;
      if (needed) return this.insufficientScope([...session.scopes, needed]);
      return this.rpcResult(msg, toolError(modelMessage(verdict, { humanTools: this.config.humanTools })));
    }

    const trace = req.headers.get("traceparent");
    const params = { ...msg.params, arguments: verdict.args, _meta: { ...(msg.params?._meta ?? {}), ...(trace ? { traceparent: trace } : {}) } };
    const upstream = await this.forward(req, JSON.stringify({ ...msg, params }), true);
    return this.rewrite(upstream, msg.id, async (result) => (await session.run.after(name, verdict.args, result)).result);
  }

  private async toolsList(req: Request, msg: RpcMessage, text: string, caller: Caller): Promise<Response> {
    const upstream = await this.forward(req, text, true);
    return this.rewrite(upstream, msg.id, async (result) => {
      const r = result as { tools?: McpTool[] } | undefined;
      if (!r || !Array.isArray(r.tools)) return result;
      let tools = r.tools;
      if (this.config.pinning !== false) {
        await this.reportTools(tools);
        tools = tools.filter((t) => !this.quarantined.has(t.name));
      }
      if (this.config.hideUnavailable !== false) {
        const session = await this.session(caller).catch(() => undefined);
        const ceiling = session ? await session.run.whoami().then((w) => new Set(w.ceiling), () => undefined) : undefined;
        if (session && ceiling) {
          tools = tools.filter((t) => {
            const permission = session.harness.spec(t.name).permission;
            return permission === null || ceiling.has(permission);
          });
        }
      }
      return { ...r, tools };
    });
  }

  /** The scope that would let this task use the tool, when the token lacks it. */
  private missingScope(session: Session, tool: string): string | undefined {
    const permission = session.harness.spec(tool).permission;
    if (!permission || !session.scopeActions) return undefined;
    return Object.entries(session.scopeActions).find(([scope, actions]) => !session.scopes.includes(scope) && actions.includes(permission))?.[0];
  }

  private insufficientScope(scopes: string[]): Response {
    const scope = [...new Set(scopes)].join(" ");
    return json({ error: "insufficient_scope", error_description: "This tool needs more access; sign in again to allow it", scope }, 403, {
      "www-authenticate": `Bearer error="insufficient_scope", scope="${scope}", resource_metadata="${this.metadataUrl()}"`,
    });
  }

  private rpcResult(msg: RpcMessage, result: unknown): Response {
    return json({ jsonrpc: "2.0", id: msg.id ?? null, result });
  }

  // ── Upstream ──────────────────────────────────────────────────────────────

  /** Forward to the upstream MCP server with the gateway's own credentials (never the user's token). */
  private async forward(req: Request, body: string | undefined, buffer = false): Promise<Response> {
    const headers = new Headers(this.config.upstream.headers ?? {});
    for (const name of FORWARD_HEADERS) {
      const v = req.headers.get(name);
      if (v && !headers.has(name)) headers.set(name, v);
    }
    const res = await this.fetchImpl(this.config.upstream.url, { method: req.method, headers, body: req.method === "POST" ? body : undefined });
    const out = new Headers();
    for (const name of ["content-type", "mcp-session-id", "cache-control"]) {
      const v = res.headers.get(name);
      if (v) out.set(name, v);
    }
    if (!buffer) return new Response(res.body, { status: res.status, headers: out });
    return new Response(await res.text(), { status: res.status, headers: out });
  }

  /** Replace the result of the response to `id`, in a JSON or an SSE body. */
  private async rewrite(res: Response, id: RpcMessage["id"], change: (result: unknown) => Promise<unknown>): Promise<Response> {
    const type = res.headers.get("content-type") ?? "";
    const text = await res.text();
    const headers = new Headers(res.headers);
    const fix = async (m: RpcMessage) => (m && m.id === id && "result" in m ? { ...m, result: await change(m.result) } : m);
    if (type.includes("text/event-stream")) {
      const events: SseEvent[] = [];
      for (const ev of parseSse(text)) {
        try {
          events.push({ ...ev, data: JSON.stringify(await fix(JSON.parse(ev.data) as RpcMessage)) });
        } catch {
          events.push(ev);
        }
      }
      return new Response(formatSse(events), { status: res.status, headers });
    }
    if (type.includes("json") && text) {
      try {
        return new Response(JSON.stringify(await fix(JSON.parse(text) as RpcMessage)), { status: res.status, headers });
      } catch {
        // not JSON after all: pass it on as it came
      }
    }
    return new Response(text, { status: res.status, headers });
  }

  // ── Tool pinning ──────────────────────────────────────────────────────────

  /** Report the listed tools to Scute; new or changed ones come back quarantined. */
  private async reportTools(tools: McpTool[]) {
    if (!this.secret) return;
    const hashed = await Promise.all(tools.map(async (t) => ({ name: t.name, hash: await toolHash(t) })));
    const report = JSON.stringify(hashed);
    if (report === this.lastReport) return;
    const id = await this.findResourceId();
    if (!id) return;
    const res = await this.fetchImpl(`${this.baseUrl}/v1/apps/${encodeURIComponent(this.appId)}/oauth/resources/${id}/tools/observe`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.secret}` },
      body: JSON.stringify({ tools: hashed }),
    });
    if (!res.ok) return; // fail open for listing only; calls to held tools are still refused below
    const body = (await res.json()) as { quarantined?: string[] };
    this.quarantined = new Set(body.quarantined ?? []);
    this.lastReport = report;
  }

  private async findResourceId(): Promise<string | undefined> {
    if (this.resourceId) return this.resourceId;
    const res = await this.fetchImpl(`${this.baseUrl}/v1/apps/${encodeURIComponent(this.appId)}/oauth/resources`, {
      headers: { authorization: `Bearer ${this.secret}` },
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { resources?: { id: string; url: string }[] };
    this.resourceId = body.resources?.find((r) => r.url === this.resource)?.id;
    return this.resourceId;
  }
}

export function createGateway(config: GatewayConfig): McpGateway {
  return new McpGateway(config);
}
