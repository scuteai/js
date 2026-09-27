import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createGateway, type GatewayConfig } from "../gateway";
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

async function setup(options: { sse?: boolean; decide?: (body: any) => any; exchange?: any; quarantined?: string[]; config?: Partial<GatewayConfig> } = {}) {
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
    if (url === `${API}/v1/apps/app1/oauth/resources/r1/tools/observe`) return reply({ quarantined: options.quarantined ?? [] });

    if (url === UPSTREAM) {
      const rpc = body as { id: number; method: string; params?: any };
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
      await sign(otherKey, {}),
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
    const [up] = upstreamCalls(seen);
    expect(up.headers.get("authorization")).toBe("Bearer upstream-secret");
    expect(JSON.stringify(up)).not.toContain(t);
    expect(up.body.params._meta).toEqual({ traceparent: "00-abc-def-01" });
  });

  it("doesn't pass the user's token on even when the upstream needs no credential", async () => {
    const { call, token, seen } = await setup({ config: { upstream: { url: UPSTREAM } } });
    const t = await token();
    await call(t, { method: "tools/call", params: { name: "read_invoice", arguments: {} } });
    const [up] = upstreamCalls(seen);
    expect(up.headers.get("authorization")).toBeNull();
    expect(JSON.stringify(up)).not.toContain(t);
  });

  it("answers a denied call itself, with words for the model", async () => {
    const { call, token, seen } = await setup({
      decide: (b) => (b.action === "delete" ? { decision: "deny", reason: "agent_role", explanation: "Claude can't delete customers." } : { decision: "allow" }),
    });
    const res = await call(await token(), { method: "tools/call", params: { name: "delete_customer", arguments: { id: 1 } } });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("Not allowed: Claude can't delete customers.");
    expect(upstreamCalls(seen)).toHaveLength(0);
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
    const { gateway, token } = await setup();
    let release!: () => void;
    const released = new Promise<void>((r) => { release = r; });
    const enc = new TextEncoder();
    const upstreamFetch = gateway.config.fetch!;
    (gateway as unknown as { fetchImpl: typeof fetch }).fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== UPSTREAM) return upstreamFetch(input, init);
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(enc.encode(formatSse([{ event: "message", data: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "sampling/createMessage", params: {} }) }])));
          await released; // the upstream waits for the client's answer
          controller.enqueue(enc.encode(formatSse([{ event: "message", data: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "done" }] } }) }])));
          controller.close();
        },
      });
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    }) as typeof fetch;

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
