// DX-08 item 9: Scute's auth MCP server over plain fetch JSON-RPC, with an
// agent key (what a voice or chat platform holds), then the backend asks
// about that conversation by the platform's id (ScuteAdminApi).

import { describe, expect, it } from "vitest";
import type { LiveContext } from "../lib/context";
import { TEST_CODE } from "../lib/context";
import { failed, ok } from "../lib/check";
import { FINDINGS, knownBug } from "../lib/findings";
import { McpHttpClient } from "../lib/mcp";
import { registerAgent } from "./agents";

export function authMcpSuite(get: () => LiveContext) {
  describe("9. auth MCP", () => {
    let mcp: McpHttpClient | undefined;
    let agentKey: string | undefined;
    const voice = () => get().agent("voice");
    const conversation = () => `${get().prefix}-conversation-1`;

    it("makes an agent key for the platform (createAgentKey)", async ({ skip }) => {
      const ctx = get();
      if (!ctx.state.policyImported) skip("needs the imported policy (the agent role)");
      await registerAgent(ctx, "voice");
      const key = ok(await ctx.admin.createAgentKey(voice(), `${ctx.prefix} platform`), "createAgentKey");
      expect(key.key.startsWith("scak_")).toBe(true);
      expect(key.hint.length).toBeGreaterThan(0);
      agentKey = key.key;
      mcp = new McpHttpClient(`${ctx.env.baseUrl}/v1/mcp/auth/${encodeURIComponent(ctx.env.appId)}`, key.key);
    });

    it("initialize and tools/list", async ({ skip }) => {
      const client = mcp ?? skip("needs the agent key");
      const init = await client.initialize();
      expect(init.status).toBe(200);
      expect(init.error).toBeUndefined();
      expect(init.result?.serverInfo.name).toBe("scute-auth");
      expect(client.sessionId, "the server names the MCP session").toBeTruthy();
      expect(await client.notify("notifications/initialized")).toBe(202);

      const tools = await client.listTools();
      const names = (tools.result?.tools ?? []).map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(["scute_identify", "scute_submit_code", "scute_check", "scute_whoami", "scute_sign_out"]));
    });

    it("scute_identify with a test email and the conversation id, then scute_submit_code 424242", async ({ skip }) => {
      const ctx = get();
      const client = mcp ?? skip("needs the agent key");
      const main = ctx.state.main ?? skip("needs the email sign-in (an active user to identify)");

      const identify = await client.callTool("scute_identify", { email: main.identifier, conversation_id: conversation() });
      expect(identify.isError, identify.text).toBe(false);
      expect(identify.structuredContent.status).toBe("code_sent");
      ctx.state.conversationId = conversation();

      const submitted = await client.callTool("scute_submit_code", { code: TEST_CODE });
      expect(submitted.isError, submitted.text).toBe(false);
      expect(submitted.structuredContent.status).toBe("verified");
    });

    it("scute_whoami and scute_check answer for the verified person", async ({ skip }) => {
      const ctx = get();
      const client = mcp ?? skip("needs the agent key");
      const main = ctx.state.main ?? skip("needs the email sign-in");
      if (!ctx.state.conversationId) skip("needs the verified conversation");

      const me = await client.callTool("scute_whoami");
      expect(me.structuredContent.verified).toBe(true);
      expect(me.structuredContent.person?.email).toBe(main.identifier);
      expect(me.structuredContent.may).toContain(ctx.perm("read"));

      const yes = await client.callTool("scute_check", { action: "read", resource: `${ctx.resource}:1` });
      expect(yes.structuredContent.decision, yes.text).toBe("allow");
      expect(typeof yes.structuredContent.say).toBe("string");

      const no = await client.callTool("scute_check", { action: "purge", resource: `${ctx.resource}:1` });
      expect(no.structuredContent.decision).toBe("deny");
      expect(no.structuredContent.say).toBeTruthy();
    });

    it("the backend looks the conversation up and checks for its person (agentConversation, agentConversationCheck)", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      const conv = ctx.state.conversationId ?? skip("needs the verified conversation");

      const found = ok(await ctx.admin.agentConversation(voice(), conv), "agentConversation");
      expect(found.conversation_id).toBe(conv);
      expect(found.verified).toBe(true);
      expect(found.ended).toBe(false);
      expect(found.person?.app_user_id).toBe(main.id);
      expect(found.person?.email).toBe(main.identifier);

      const allowed = ok(await ctx.admin.agentConversationCheck(voice(), conv, { action: "read", resource: `${ctx.resource}:1` }), "agentConversationCheck");
      expect(allowed.decision, allowed.reason).toBe("allow");
      const denied = ok(await ctx.admin.agentConversationCheck(voice(), conv, { action: "purge", resource: ctx.resource }), "agentConversationCheck");
      expect(denied.decision).toBe("deny");
      expect(denied.say).toBeTruthy();
    });

    it("scute_identify with a test phone number (known bug F5: 500)", async ({ skip, annotate }) => {
      const ctx = get();
      const key = agentKey ?? skip("needs the agent key");
      if (!ctx.state.phone) skip("needs the SMS sign-in (an active user with that phone)");
      // A second conversation on the same key, so the first one stays as it is.
      const other = new McpHttpClient(`${ctx.env.baseUrl}/v1/mcp/auth/${encodeURIComponent(ctx.env.appId)}`, key);
      expect((await other.initialize()).status).toBe(200);
      const answer = await other.request("tools/call", { name: "scute_identify", arguments: { phone: ctx.phone } });
      await other.close();
      // F5: find_user looks the phone up on app_users, which has no phone column.
      if (answer.status === 500) {
        await knownBug(annotate, FINDINGS.phoneLookup500, true, "tools/call scute_identify {phone} answered HTTP 500");
        return;
      }
      await knownBug(annotate, FINDINGS.phoneLookup500, false, "");
    });

    it("once the platform ends the conversation, the backend check refuses (not_verified)", async ({ skip }) => {
      const ctx = get();
      const client = mcp ?? skip("needs the agent key");
      const conv = ctx.state.conversationId ?? skip("needs the verified conversation");

      expect(await client.close()).toBe(204);
      const found = ok(await ctx.admin.agentConversation(voice(), conv), "agentConversation");
      expect(found.ended).toBe(true);
      const refused = failed(await ctx.admin.agentConversationCheck(voice(), conv, { action: "read", resource: ctx.resource }), "agentConversationCheck");
      expect(refused.status).toBe(409);
      expect(refused.code).toBe("not_verified");
    });
  });
}
