// @scute/mcp-gateway, live: an MCP client signs the user in through the
// app's OAuth 2.1 server (PKCE; the consent is given with the user's session
// token, as the hosted page would), the access token is verified locally
// against the app's JWKS (verifyAccessToken, tampered/expired/misaddressed
// refused), and the gateway runs in this process in front of an in-process
// MCP server: metadata, tools/list filtered by the task, tools/call through
// the harness, and the gateway's own human tools. Nothing listens on a port.

import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Jwks, canonicalResource, createGateway, verifyAccessToken, type McpGateway } from "@scute/mcp-gateway";
import type { LiveContext } from "../lib/context";
import { PHASE, TEST_CODE } from "../lib/context";
import { claimsOf, tamper } from "../lib/check";
import { accessOf } from "../lib/flows";
import { parseRpc } from "../lib/mcp";
import { FakeUpstream } from "../lib/upstream";
import { registerAgent, toolsFor } from "./agents";

const UPSTREAM_CREDENTIAL = "Bearer live-upstream-credential";

export function gatewaySuite(get: () => LiveContext) {
  describe("MCP gateway (@scute/mcp-gateway)", () => {
    let resourceUrl = "";
    let clientId = "";
    let redirectUri = "";
    let issuer = "";
    let jwksUri = "";
    let upstream: FakeUpstream | undefined;
    let gateway: McpGateway | undefined;
    let nextId = 1;

    const rpc = async (method: string, params: Record<string, unknown>, token = get().state.oauthAccessToken) => {
      const res = await gateway!.handle(
        new Request(resourceUrl, {
          method: "POST",
          headers: {
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
        })
      );
      const text = await res.text();
      return { res, body: parseRpc(text, res.headers.get("content-type") ?? "") as { result?: any; error?: any } | null };
    };

    /** The gateway, its upstream and the user's access token, or a skip. */
    const ready = (skip: (note?: string) => never) => {
      const token = get().state.oauthAccessToken;
      if (!gateway || !upstream || !token) return skip("needs the gateway and the access token");
      return { gateway, upstream, token };
    };

    const callTool = async (name: string, args: Record<string, unknown> = {}) => {
      const { res, body } = await rpc("tools/call", { name, arguments: args });
      expect(res.status, `tools/call ${name}`).toBe(200);
      const result = body?.result ?? {};
      const text = (result.content ?? []).map((c: { text?: string }) => c.text ?? "").join("\n");
      return { isError: result.isError === true, text, structured: result.structuredContent as Record<string, any> | undefined };
    };

    it("sets up MCP sign-in: the OAuth server on, an MCP server, a client linked to an agent (no SDK methods: /oauth/*)", async ({ skip }) => {
      const ctx = get();
      if (!ctx.state.policyImported) skip("needs the imported policy (the agent role)");
      const oauth = `${ctx.api.appPath}/oauth`;

      const { data: before } = await ctx.api.get(`${oauth}/settings`);
      const wasEnabled = before.enabled === true;
      ctx.cleanup.add(PHASE.settings, "restore the OAuth server setting", () => ctx.api.patch(`${oauth}/settings`, { enabled: wasEnabled }));
      const { data: settings } = await ctx.api.patch(`${oauth}/settings`, { enabled: true });
      expect(settings.enabled).toBe(true);
      issuer = settings.issuer;

      await registerAgent(ctx, "mcp");
      resourceUrl = `https://${ctx.prefix}.mcp.scute.test/mcp`;
      const { data: resource } = await ctx.api.post(`${oauth}/resources`, { url: resourceUrl, name: `${ctx.prefix} MCP server`, scopes: ["mcp"] });
      ctx.cleanup.add(PHASE.oauth, "delete the MCP server", () => ctx.api.delete(`${oauth}/resources/${resource.id}`, { expect: [204, 404] }));
      expect(resource.url).toBe(canonicalResource(resourceUrl));

      redirectUri = "http://127.0.0.1:49152/callback";
      const { data: client } = await ctx.api.post(`${oauth}/clients`, { name: `${ctx.prefix} client`, redirect_uris: [redirectUri] });
      ctx.cleanup.add(PHASE.oauth, "delete the OAuth client", () => ctx.api.delete(`${oauth}/clients/${client.id}`, { expect: [204, 404] }));
      await ctx.api.patch(`${oauth}/clients/${client.id}`, { agent: ctx.agent("mcp") });
      clientId = client.client_id;

      const { data: meta } = await ctx.api.get(`/v1/oauth/${encodeURIComponent(ctx.env.appId)}/.well-known/oauth-authorization-server`, { auth: "none" });
      expect(meta.issuer).toBe(issuer);
      jwksUri = meta.jwks_uri;

      upstream = new FakeUpstream(`http://upstream.${ctx.prefix}.invalid/mcp`, [
        { name: "read_doc", description: "Read a document", inputSchema: { type: "object", properties: { doc_id: { type: "string" } } } },
        { name: "edit_doc", description: "Edit a document", inputSchema: { type: "object", properties: { doc_id: { type: "string" } } } },
        { name: "delete_doc", description: "Delete a document", inputSchema: { type: "object", properties: { doc_id: { type: "string" } } } },
        { name: "purge_doc", description: "Purge a document", inputSchema: { type: "object", properties: { doc_id: { type: "string" } } } },
      ]);
      gateway = createGateway({
        appId: ctx.env.appId,
        secret: ctx.env.secret,
        baseUrl: ctx.env.baseUrl,
        resource: resourceUrl,
        upstream: { url: upstream.url, headers: { authorization: UPSTREAM_CREDENTIAL } },
        tools: toolsFor(ctx),
        fetch: upstream.fetch,
      });
    });

    it("an MCP client gets an access token for the user: authorize, consent, code, token (OAuth 2.1 with PKCE)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in (the user who consents)");
      if (!clientId) skip("needs the MCP sign-in setup");
      const app = encodeURIComponent(ctx.env.appId);
      const verifier = randomBytes(32).toString("base64url");
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      const state = randomBytes(8).toString("hex");

      // What the MCP client does: send the browser to /authorize, which hands it to the consent page.
      const authorize = await ctx.api.get(`/v1/oauth/${app}/authorize`, {
        auth: "none",
        redirect: "manual",
        expect: [302, 303],
        query: {
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: challenge,
          code_challenge_method: "S256",
          state,
          scope: "mcp",
          resource: resourceUrl,
        },
      });
      const handle = new URL(authorize.headers.get("location") ?? "").searchParams.get("request");
      expect(handle, "the consent page gets a request handle").toBeTruthy();

      // What the consent page does once the user is signed in: approve with their session token.
      const { data: decided } = await ctx.api.post(
        `/v1/oauth/${app}/requests/${encodeURIComponent(handle!)}/decision`,
        { decision: "approve" },
        { auth: { access: await accessOf(main.client) } }
      );
      const back = new URL(decided.redirect_to);
      expect(`${back.origin}${back.pathname}`).toBe(redirectUri);
      expect(back.searchParams.get("state")).toBe(state);
      expect(back.searchParams.get("iss")).toBe(issuer);
      const code = back.searchParams.get("code");
      expect(code).toBeTruthy();

      const { data: tokens } = await ctx.api.post(`/v1/oauth/${app}/token`, undefined, {
        auth: "none",
        form: {
          grant_type: "authorization_code",
          code: code!,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: verifier,
          resource: resourceUrl,
        },
      });
      expect(tokens.token_type).toBe("Bearer");
      expect(typeof tokens.access_token).toBe("string");
      expect(tokens.scope).toBe("mcp");
      ctx.state.oauthAccessToken = tokens.access_token;
    });

    it("verifies the access token locally with the app's JWKS, and refuses tampered, expired and misaddressed ones (verifyAccessToken, Jwks)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const token = ctx.state.oauthAccessToken ?? skip("needs the access token");
      const jwks = new Jwks(jwksUri, fetch);
      const audience = canonicalResource(resourceUrl);

      const claims = await verifyAccessToken(token, { jwks, issuer, audience });
      expect(claims?.sub).toBe(main.id);
      expect(claims?.client_id).toBe(clientId);
      expect(claims?.scope).toBe("mcp");
      expect(claimsOf(token).exp).toBe(claims?.exp);

      expect(await verifyAccessToken(tamper(token), { jwks, issuer, audience }), "tampered").toBeNull();
      expect(await verifyAccessToken(token, { jwks, issuer, audience, now: (claims!.exp + 3600) * 1000 }), "expired").toBeNull();
      expect(await verifyAccessToken(token, { jwks, issuer, audience: "https://elsewhere.example/mcp" }), "another audience").toBeNull();
      expect(await verifyAccessToken(token, { jwks, issuer: "https://elsewhere.example", audience }), "another issuer").toBeNull();
    });

    it("serves the protected resource metadata, and asks for sign-in without a token", async ({ skip }) => {
      const gw = gateway ?? skip("needs the gateway");
      const origin = new URL(resourceUrl).origin;
      const metaRes = await gw.handle(new Request(`${origin}/.well-known/oauth-protected-resource/mcp`));
      expect(metaRes.status).toBe(200);
      const meta = await metaRes.json();
      expect(meta.resource).toBe(canonicalResource(resourceUrl));
      expect(meta.authorization_servers).toEqual([issuer]);

      const { res } = await rpc("tools/list", {}, "");
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate") ?? "").toContain("resource_metadata=");
    });

    it("tools/list shows what the task could use, plus the gateway's own tools", async ({ skip }) => {
      ready(skip);
      const { res, body } = await rpc("tools/list", {});
      expect(res.status).toBe(200);
      const names: string[] = (body?.result?.tools ?? []).map((t: { name: string }) => t.name);
      expect(names).toEqual(expect.arrayContaining(["read_doc", "edit_doc", "delete_doc", "scute_verify_person", "scute_whoami"]));
      expect(names, "the agent's roles never allow purge").not.toContain("purge_doc");

      // Pinning: the tools were reported and trusted on first use.
      const ctx = get();
      const { data } = await ctx.api.get(`${ctx.api.appPath}/oauth/resources`);
      const mine = (data.resources ?? []).find((r: { url: string }) => r.url === canonicalResource(resourceUrl));
      expect(mine?.quarantined_tools ?? null).toEqual([]);
    });

    it("tools/call runs an allowed call upstream, with the gateway's credential and never the user's token", async ({ skip }) => {
      const { upstream: up } = ready(skip);
      const out = await callTool("read_doc", { doc_id: "1" });
      expect(out.isError, out.text).toBe(false);
      expect(out.text).toContain("upstream ran read_doc");
      const last = up.calls[up.calls.length - 1];
      expect(last?.tool).toBe("read_doc");
      expect(last?.authorization === UPSTREAM_CREDENTIAL, "the upstream sees the gateway's credential").toBe(true);
    });

    it("tools/call refuses what the engine refuses, without calling upstream", async ({ skip }) => {
      const { upstream: up } = ready(skip);
      const before = up.calls.length;
      const out = await callTool("purge_doc", { doc_id: "1" });
      expect(out.isError).toBe(true);
      expect(out.text).toMatch(/Not allowed/);
      expect(up.calls.length).toBe(before);
    });

    it("a call that needs verification points at scute_verify_person; the person verifies through the gateway's tools and it runs", async ({ skip }) => {
      const { upstream: up } = ready(skip);
      const asked = await callTool("edit_doc", { doc_id: "3" });
      expect(asked.isError).toBe(true);
      expect(asked.text).toContain("scute_verify_person");

      const started = await callTool("scute_verify_person", { method: "email_otp" });
      expect(started.isError, started.text).toBe(false);
      expect(started.structured?.status).toBe("pending");
      const submitted = await callTool("scute_submit_code", { code: TEST_CODE });
      expect(submitted.structured?.status, submitted.text).toBe("completed");

      const after = await callTool("edit_doc", { doc_id: "3" });
      expect(after.isError, after.text).toBe(false);
      expect(up.calls[up.calls.length - 1]?.tool).toBe("edit_doc");
    });

    it("scute_whoami answers from the user's task", async ({ skip }) => {
      const main = get().state.main ?? skip("needs the email sign-in");
      ready(skip);
      const me = await callTool("scute_whoami");
      expect(me.isError, me.text).toBe(false);
      expect(me.structured?.acts_for).toBe(main.id);
      expect(me.structured?.may).toContain(get().perm("read"));
    });
  });
}
