import { webcrypto } from "node:crypto";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGateway, type GatewayConfig } from "../gateway";
import { nodeListener } from "../node";
import { toolHash } from "../pins";
import { formatSse, parseSse } from "../sse";

const subtle = (webcrypto as unknown as Crypto).subtle;
const API = "https://api.test";
const ISSUER = `${API}/v1/oauth/app1`;
const RESOURCE = "https://mcp.test/mcp";
const UPSTREAM = "https://upstream.test/mcp";

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function keyPair() {
  return subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
}

async function sign(key: CryptoKey, claims: Record<string, unknown>, header: Record<string, unknown> = {}) {
  const head = enc({ alg: "RS256", typ: "at+jwt", kid: "k1", ...header });
  const body = enc({ iss: ISSUER, sub: "user1", aud: RESOURCE, scope: "mcp", jti: `j-${Math.random()}`, exp: Math.floor(Date.now() / 1000) + 600, ...claims });
  const sig = new Uint8Array(await subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

const TOOLS = [
  { name: "read_invoice", description: "Read one invoice", inputSchema: { type: "object" } },
  { name: "refund_invoice", description: "Refund an invoice", inputSchema: { type: "object" } },
  { name: "delete_customer", description: "Delete a customer", inputSchema: { type: "object" } },
  { name: "export_everything", description: "Changed yesterday", inputSchema: { type: "object" } },
  { name: "scute_whoami", description: "An upstream tool with a clashing name", inputSchema: { type: "object" } },
];

const OWN = ["scute_verify_person", "scute_submit_code", "scute_check_verification", "scute_approval_status", "scute_whoami"];

type Seen = { url: string; method: string; headers: Headers; body: any };

type SetupOptions = {
  sse?: boolean;
  decide?: (body: any) => any;
  exchange?: any;
  quarantined?: string[];
  config?: Partial<GatewayConfig>;
  /** Replace Scute's answer to tools/observe. */
  observe?: () => Response;
  /** Replace the upstream's answer; return undefined for the default. */
  upstream?: (rpc: any) => Response | undefined;
};

async function setup(options: SetupOptions = {}) {
  const { publicKey, privateKey } = await keyPair();
  const jwk = await subtle.exportKey("jwk", publicKey);
  const seen: Seen[] = [];
  const reply = (body: unknown, status = 200, type = "application/json") =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": type } });

  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const raw = init.body ? String(init.body) : undefined;
    let body: any = raw;
    try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
    seen.push({ url, method: init.method ?? "GET", headers: new Headers(init.headers), body });

    if (url === `${ISSUER}/.well-known/oauth-authorization-server`) {
      return reply({ issuer: ISSUER, jwks_uri: `${API}/v1/auth/app1/jwks`, scopes_supported: ["mcp", "tools:write"] });
    }
    if (url === `${API}/v1/auth/app1/jwks`) return reply({ keys: [{ ...jwk, kid: "k1", use: "sig" }] });
    if (url === `${ISSUER}/token`) {
      return reply(options.exchange ?? { access_token: "sct_task", agent: "claude", expires_in: 1800, scope: "mcp",
        scope_actions: { mcp: ["invoice:read"], "tools:write": ["invoice:refund"] } });
    }
    if (url === `${API}/v1/auth/app1/agent/check`) {
      return reply(options.decide?.(body) ?? { decision: "allow", reason: "agent_role" });
    }
    if (url === `${API}/v1/auth/app1/agent/whoami`) {
      return reply({ agent: "claude", task: "t1", acts_for: "user1", chain: [], agent_roles: ["support"], permissions: ["invoice:read"],
        ceiling: ["invoice:read", "invoice:refund", "everything:export"], step_up: [], approval: [], actions: null, resources: null,
        expires_at: new Date(Date.now() + 1_800_000).toISOString() });
    }
    if (url === `${API}/v1/auth/app1/agent/sessions`) return reply({ id: "sess1", task_id: "t1", verified: false }, 201);
    if (url === `${API}/v1/auth/app1/agent/verifications`) {
      return reply({ token: "ch_1", status: "pending", method: body.method, say: "I've emailed a code to a***@example.com. What's the code?" }, 201);
    }
    if (url === `${API}/v1/auth/app1/agent/verifications/ch_1/code`) {
      return body.code === "123456"
        ? reply({ token: "ch_1", status: "completed", say: "Thanks, you're verified." })
        : reply({ token: "ch_1", status: "pending", remaining_attempts: 2, error: "Invalid code", say: "That code didn't work." }, 422);
    }
    if (url === `${API}/v1/apps/app1/oauth/resources`) return reply({ resources: [{ id: "r1", url: RESOURCE }] });
    if (url === `${API}/v1/apps/app1/oauth/resources/r1/tools/observe`) return options.observe?.() ?? reply({ quarantined: options.quarantined ?? [] });

    if (url === UPSTREAM) {
      const rpc = body as { id: number; method: string; params?: any };
      const custom = options.upstream?.(rpc);
      if (custom) return custom;
      const result = rpc.method === "tools/list" ? { tools: TOOLS }
        : rpc.method === "tools/call" ? { content: [{ type: "text", text: `ran ${rpc.params.name}` }] }
        : { ok: true };
      const message = { jsonrpc: "2.0", id: rpc.id, result };
      return options.sse
        ? reply(formatSse([{ event: "message", data: JSON.stringify(message) }]), 200, "text/event-stream")
        : reply(message);
    }
    return reply({ error: "not found" }, 404);
  }) as typeof fetch;

  const gateway = createGateway({ appId: "app1", secret: "sk_test", baseUrl: API, resource: RESOURCE,
    upstream: { url: UPSTREAM, headers: { authorization: "Bearer upstream-secret" } }, fetch: fetchImpl, ...options.config });
  const call = async (token: string | undefined, rpc: Record<string, unknown>, headers: Record<string, string> = {}) =>
    gateway.handle(new Request(RESOURCE, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...rpc }) }));
  return { gateway, seen, call, token: (claims: Record<string, unknown> = {}, header = {}) => sign(privateKey, claims, header), otherKey: (await keyPair()).privateKey };
}

const upstreamCalls = (seen: Seen[]) => seen.filter((s) => s.url === UPSTREAM);
const upstreamToolCalls = (seen: Seen[]) => upstreamCalls(seen).filter((s) => s.body?.method === "tools/call");
const observeCalls = (seen: Seen[]) => seen.filter((s) => s.url.endsWith("/tools/observe"));
/** Headers serialize to {} with JSON.stringify, so spell them out before searching a request for a token. */
const serialize = (s: Seen) => {
  const headers: Record<string, string> = {};
  s.headers.forEach((v, k) => { headers[k] = v; });
  return { ...s, headers };
};

describe("MCP gateway", () => {
  it("serves protected resource metadata that points at the app's OAuth server", async () => {
    const { gateway } = await setup();
    const res = await gateway.handle(new Request("https://mcp.test/.well-known/oauth-protected-resource/mcp"));
    expect(await res.json()).toMatchObject({ resource: RESOURCE, authorization_servers: [ISSUER], bearer_methods_supported: ["header"] });
  });

  it("asks unauthenticated clients to sign in", async () => {
    const { call } = await setup();
    const res = await call(undefined, { method: "tools/list" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain('resource_metadata="https://mcp.test/.well-known/oauth-protected-resource/mcp"');
  });

  it("refuses tokens for another server, expired, from another issuer or badly signed", async () => {
    const { call, token, otherKey } = await setup();
    for (const t of [
      await token({ aud: "https://other.test/mcp" }),
      await token({ exp: Math.floor(Date.now() / 1000) - 120 }),
      await token({ iss: "https://evil.test/v1/oauth/app1" }),
      await token({}, { typ: "JWT" }),
      await token({}, { alg: "none" }),
      await token({}, { alg: "HS256" }),
      await token({}, { kid: undefined }),
      await token({}, { kid: "unknown" }),
      await token({ sub: undefined }),
      await sign(otherKey, {}),
      `${(await token()).split(".").slice(0, 2).join(".")}.`, // empty signature
      `${(await token()).split(".").slice(0, 2).join(".")}.!!not*base64`, // malformed signature: 401, not a gateway error
    ]) {
      const res = await call(t, { method: "tools/list" });
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
    }
  });

  it("lists only tools that are pinned and that the task could use", async () => {
    const { call, token } = await setup({ quarantined: ["export_everything"] });
    const res = await call(await token(), { method: "tools/list" });
    const body = await res.json();
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual(["read_invoice", "refund_invoice", ...OWN]);
  });

  it("filters an SSE response too", async () => {
    const { call, token } = await setup({ sse: true });
    const res = await call(await token(), { method: "tools/list" });
    const [event] = parseSse(await res.text());
    expect(JSON.parse(event.data).result.tools.map((t: { name: string }) => t.name)).toEqual(["read_invoice", "refund_invoice", "export_everything", ...OWN]);
  });

  it("runs allowed calls upstream with its own credentials, never the user's token", async () => {
    const { call, token, seen } = await setup();
    const t = await token();
    const res = await call(t, { method: "tools/call", params: { name: "read_invoice", arguments: { id: 7 } } }, { traceparent: "00-abc-def-01" });

    expect((await res.json()).result.content[0].text).toBe("ran read_invoice");
    const [up] = upstreamToolCalls(seen);
    expect(up.headers.get("authorization")).toBe("Bearer upstream-secret");
    expect(JSON.stringify(serialize(up))).not.toContain(t);
    expect(up.body.params._meta).toEqual({ traceparent: "00-abc-def-01" });
  });

  it("doesn't pass the user's token on even when the upstream needs no credential", async () => {
    const { call, token, seen } = await setup({ config: { upstream: { url: UPSTREAM } } });
    const t = await token();
    await call(t, { method: "tools/call", params: { name: "read_invoice", arguments: {} } });
    const [up] = upstreamToolCalls(seen);
    expect(up.headers.get("authorization")).toBeNull();
    expect(JSON.stringify(serialize(up))).not.toContain(t);
  });

  it("answers a denied call itself, with words for the model", async () => {
    const { call, token, seen } = await setup({
      decide: (b) => (b.action === "delete" ? { decision: "deny", reason: "agent_role", explanation: "Claude can't delete customers." } : { decision: "allow" }),
    });
    const res = await call(await token(), { method: "tools/call", params: { name: "delete_customer", arguments: { id: 1 } } });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("Not allowed: Claude can't delete customers.");
    expect(upstreamToolCalls(seen)).toHaveLength(0);
  });

  it("asks the client for more scope when the task doesn't cover the tool", async () => {
    const { call, token } = await setup({
      decide: (b) => (b.action === "refund" ? { decision: "deny", reason: "outside_task", explanation: "This task doesn't cover it." } : { decision: "allow" }),
    });
    const res = await call(await token(), { method: "tools/call", params: { name: "refund_invoice", arguments: { id: 1 } } });
    expect(res.status).toBe(403);
    expect(res.headers.get("www-authenticate")).toContain('error="insufficient_scope", scope="mcp tools:write"');
  });

  it("refuses a held tool and trades each token for a task once", async () => {
    const { call, token, seen } = await setup({ quarantined: ["export_everything"] });
    const t = await token();
    await call(t, { method: "tools/list" });
    const held = await (await call(t, { method: "tools/call", params: { name: "export_everything", arguments: {} } })).json();
    expect(held.result.content[0].text).toContain("held for review");

    await call(t, { method: "tools/call", params: { name: "read_invoice", arguments: {} } });
    const exchanges = seen.filter((s) => s.url === `${ISSUER}/token`);
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0].headers.get("authorization")).toBe("Bearer sk_test");
    expect(String(exchanges[0].body)).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange");
  });

  it("refuses a foreign Host or Origin (DNS rebinding)", async () => {
    const { gateway, token } = await setup();
    const t = await token();
    for (const headers of [{ host: "evil.example.com" }, { origin: "http://evil.example.com" }] as Record<string, string>[]) {
      const res = await gateway.handle(new Request(RESOURCE, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}`, ...headers },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) }));
      expect(res.status).toBe(403);
    }
    const ok = await gateway.handle(new Request(RESOURCE, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}`, origin: "https://mcp.test" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) }));
    expect(ok.status).toBe(200);
  });

  it("streams a tool call's events as they come (the upstream may ask the client something first)", async () => {
    let release!: () => void;
    const released = new Promise<void>((r) => { release = r; });
    const enc = new TextEncoder();
    const { gateway, token } = await setup({ upstream: (rpc) => {
      if (rpc.method !== "tools/call") return undefined;
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(enc.encode(formatSse([{ event: "message", data: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "sampling/createMessage", params: {} }) }])));
          await released; // the upstream waits for the client's answer
          controller.enqueue(enc.encode(formatSse([{ event: "message", data: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "done" }] } }) }])));
          controller.close();
        },
      });
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    } });

    const res = await gateway.handle(new Request(RESOURCE, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read_invoice", arguments: {} } }) }));
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain("sampling/createMessage");
    release();
    let rest = "";
    for (let r = await reader.read(); !r.done; r = await reader.read()) rest += new TextDecoder().decode(r.value);
    expect(JSON.parse(parseSse(rest)[0].data).result.content[0].text).toBe("done");
  });

  describe("its own tools for bringing the person in (RB-43 part D)", () => {
    it("lists them after the upstream's, replacing an upstream tool of the same name", async () => {
      const { call, token } = await setup({ config: { hideUnavailable: false } });
      const tools = (await (await call(await token(), { method: "tools/list" })).json()).result.tools as { name: string; description: string }[];

      expect(tools.filter((t) => t.name === "scute_whoami")).toHaveLength(1);
      expect(tools.find((t) => t.name === "scute_whoami")?.description).toContain("Who you're working for");
      expect(tools.find((t) => t.name === "scute_verify_person")).toMatchObject({ inputSchema: { type: "object" } });
    });

    it("verifies the person with the task token, never through the upstream", async () => {
      const { call, token, seen } = await setup();
      const t = await token();

      const started = (await (await call(t, { method: "tools/call", params: { name: "scute_verify_person", arguments: { method: "email_otp" } } })).json()).result;
      expect(started.isError).toBe(false);
      expect(started.structuredContent).toMatchObject({ status: "pending", say: expect.stringContaining("emailed a code") });
      expect(started.content[0].text).toContain("What's the code?");

      const wrong = (await (await call(t, { method: "tools/call", params: { name: "scute_submit_code", arguments: { code: "000000" } } })).json()).result;
      expect(wrong.isError).toBe(false); // a wrong code is a pending verification with a line to say, not a failure
      expect(wrong.structuredContent).toMatchObject({ status: "pending", remaining_attempts: 2, say: expect.stringContaining("didn't work") });

      const done = (await (await call(t, { method: "tools/call", params: { name: "scute_submit_code", arguments: { code: "123 456" } } })).json()).result;
      expect(done.structuredContent).toMatchObject({ status: "completed" });

      const verify = seen.find((s) => s.url === `${API}/v1/auth/app1/agent/verifications`);
      expect(verify?.headers.get("authorization")).toBe("Bearer sct_task");
      expect(upstreamCalls(seen)).toHaveLength(0);
    });

    it("answers whoami from the task", async () => {
      const { call, token } = await setup();
      const me = (await (await call(await token(), { method: "tools/call", params: { name: "scute_whoami", arguments: {} } })).json()).result;

      expect(me.structuredContent).toMatchObject({ acts_for: "user1", may: ["invoice:read"], could_with_more_access: ["invoice:refund", "everything:export"] });
    });

    it("points the model at them when a call needs verification", async () => {
      const { call, token } = await setup({
        decide: (b) => (b.action === "refund" ? { decision: "allow_with_step_up", reason: "verification_required", explanation: "Refunds need verification." } : { decision: "allow" }),
      });
      const res = await call(await token(), { method: "tools/call", params: { name: "refund_invoice", arguments: { id: 1 } } });

      expect((await res.json()).result.content[0].text).toContain("scute_verify_person");
    });

    it("can be turned off, leaving the upstream's tools alone", async () => {
      const { call, token } = await setup({ config: { humanTools: false } });
      const tools = (await (await call(await token(), { method: "tools/list" })).json()).result.tools as { name: string; description: string }[];

      expect(tools.map((t) => t.name)).toEqual(["read_invoice", "refund_invoice", "export_everything"]);
    });
  });

  it("tells the model when Scute can't start a task", async () => {
    const { call, token } = await setup({ exchange: { error: "invalid_request", error_description: "No agent is linked to this client" } });
    const body = await (await call(await token(), { method: "tools/call", params: { name: "read_invoice", arguments: {} } })).json();
    expect(body.result.content[0].text).toContain("No agent is linked");
  });
});

describe("MCP gateway: pinning and failure handling", () => {
  it("refuses a held tool even when the client never listed tools", async () => {
    const { call, token, seen } = await setup({ quarantined: ["export_everything"] });
    const t = await token();
    const held = await (await call(t, { method: "tools/call", params: { name: "export_everything", arguments: {} } })).json();

    expect(held.result.isError).toBe(true);
    expect(held.result.content[0].text).toContain("held for review");
    // The gateway listed the upstream's tools itself, with its own credentials, and never ran the held tool.
    const ups = upstreamCalls(seen);
    expect(ups.map((u) => u.body.method)).toEqual(["tools/list"]);
    expect(ups[0].headers.get("authorization")).toBe("Bearer upstream-secret");
    expect(JSON.stringify(serialize(ups[0]))).not.toContain(t);
    // ...and reported every tool's pin hash.
    const [observe] = observeCalls(seen);
    expect(observe.body.tools).toEqual(await Promise.all(TOOLS.map(async (tool) => ({ name: tool.name, hash: await toolHash(tool) }))));

    // A pinned tool runs, and the tools aren't listed again.
    const ok = await (await call(t, { method: "tools/call", params: { name: "read_invoice", arguments: {} } })).json();
    expect(ok.result.content[0].text).toBe("ran read_invoice");
    expect(upstreamCalls(seen).map((u) => u.body.method)).toEqual(["tools/list", "tools/call"]);
  });

  it("learns the quarantine from an SSE tools/list too", async () => {
    const { call, token, seen } = await setup({ sse: true, quarantined: ["export_everything"] });
    const res = await call(await token(), { method: "tools/call", params: { name: "export_everything", arguments: {} } });
    expect((await res.json()).result.content[0].text).toContain("held for review");
    expect(upstreamCalls(seen).map((u) => u.body.method)).toEqual(["tools/list"]);
  });

  it("pauses tool calls while Scute can't confirm the pins", async () => {
    const { call, token, seen } = await setup({ observe: () => new Response("down", { status: 500 }) });
    const body = await (await call(await token(), { method: "tools/call", params: { name: "read_invoice", arguments: {} } })).json();

    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("couldn't confirm");
    expect(upstreamCalls(seen).map((u) => u.body.method)).toEqual(["tools/list"]);
  });

  it("still lists tools when tools/observe is down (listing fails open; calls are what's guarded)", async () => {
    const { call, token } = await setup({ observe: () => new Response("down", { status: 500 }) });
    const res = await call(await token(), { method: "tools/list" });
    expect(res.status).toBe(200);
    expect((await res.json()).result.tools.map((x: { name: string }) => x.name)).toContain("read_invoice");
  });

  it("answers with an error, not the upstream's unchecked tool list, when checking it fails", async () => {
    const { call, token } = await setup({ observe: () => new Response("<html>oops</html>", { status: 200, headers: { "content-type": "application/json" } }) });
    const res = await call(await token(), { method: "tools/list" });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toMatchObject({ jsonrpc: "2.0", id: 1, error: { code: -32603 } });
    expect(JSON.stringify(body)).not.toContain("export_everything");
  });

  it("sends an error event, not the upstream's unchecked answer, when checking an SSE answer fails", async () => {
    const { call, token } = await setup({ sse: true, observe: () => new Response("<html>oops</html>", { status: 200, headers: { "content-type": "application/json" } }) });
    const text = await (await call(await token(), { method: "tools/list" })).text();
    const [event] = parseSse(text);
    expect(JSON.parse(event.data)).toMatchObject({ jsonrpc: "2.0", id: 1, error: { code: -32603 } });
    expect(text).not.toContain("export_everything");
  });

  it("passes a body that isn't JSON-RPC on unchanged", async () => {
    const { call, token } = await setup({ config: { pinning: false },
      upstream: (rpc) => (rpc.method === "tools/call" ? new Response("plain words", { headers: { "content-type": "application/json" } }) : undefined) });
    const res = await call(await token(), { method: "tools/call", params: { name: "read_invoice", arguments: {} } });
    expect(await res.text()).toBe("plain words");
  });

  it("reads SSE events separated by lone carriage returns", async () => {
    const { call, token } = await setup({ quarantined: ["export_everything"],
      upstream: (rpc) => rpc.method === "tools/list"
        ? new Response(`event: message\rdata: ${JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { tools: TOOLS } })}\r\r`, { headers: { "content-type": "text/event-stream" } })
        : undefined });
    const [event] = parseSse(await (await call(await token(), { method: "tools/list" })).text());
    expect(JSON.parse(event.data).result.tools.map((x: { name: string }) => x.name)).not.toContain("export_everything");
  });

  describe("task sessions", () => {
    afterEach(() => vi.useRealTimers());

    it("starts a new task once the cached task token has expired", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const { call, token, seen } = await setup({ exchange: { access_token: "sct_task", agent: "claude", expires_in: 60, scope: "mcp" } });
      const t = await token(); // valid for 10 minutes
      const run = () => call(t, { method: "tools/call", params: { name: "read_invoice", arguments: {} } });
      const exchanges = () => seen.filter((s) => s.url === `${ISSUER}/token`).length;

      await run();
      await run();
      expect(exchanges()).toBe(1);
      vi.setSystemTime(Date.now() + 61_000);
      await run();
      expect(exchanges()).toBe(2);
    });
  });
});

describe("nodeListener", () => {
  let server: Server | undefined;
  afterEach(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
    server = undefined;
  });

  async function serve(handler: (req: Request) => Promise<Response>, options?: { trustProxy?: boolean }) {
    server = createServer(nodeListener(handler, options));
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
    const { port } = server.address() as AddressInfo;
    return (headers: Record<string, string> = {}) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = httpRequest({ host: "127.0.0.1", port, path: "/mcp", method: "GET", headers }, (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
        });
        req.on("error", reject);
        req.end();
      });
  }

  it("behind a trusted proxy, gives the handler the forwarded host in both the URL and the Host header", async () => {
    let seen: { url: string; host: string | null } | undefined;
    const get = await serve(async (req) => {
      seen = { url: req.url, host: req.headers.get("host") };
      return new Response("ok");
    }, { trustProxy: true });
    await get({ "x-forwarded-host": "mcp.test, internal.lb", "x-forwarded-proto": "https" });
    expect(seen).toEqual({ url: "https://mcp.test/mcp", host: "mcp.test" });
  });

  it("ignores forwarded headers without trustProxy", async () => {
    let seen: { url: string; host: string | null } | undefined;
    const get = await serve(async (req) => {
      seen = { url: req.url, host: req.headers.get("host") };
      return new Response("ok");
    });
    await get({ "x-forwarded-host": "mcp.test", "x-forwarded-proto": "https" });
    expect(seen?.url.startsWith("http://127.0.0.1:")).toBe(true);
    expect(seen?.host).toMatch(/^127\.0\.0\.1:\d+$/);
  });

  it("doesn't echo internal error text", async () => {
    const get = await serve(async () => { throw new Error("db password is hunter2"); });
    const res = await get();
    expect(res.status).toBe(500);
    expect(res.body).not.toContain("hunter2");
    expect(JSON.parse(res.body)).toMatchObject({ error: "gateway_error" });
  });
});
