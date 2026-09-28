/**
 * The auth MCP from your backend: agent keys, and asking about a
 * conversation by the platform's own id.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScuteAdminApi from "../ScuteAdminApi";
import { APP_ID, BASE_URL, createServer, type TestServer } from "./harness";

let server: TestServer;
const base = `/v1/apps/${APP_ID}/authz/agents/voice-bot`;
const admin = () => new ScuteAdminApi({ appId: APP_ID, baseUrl: BASE_URL, secretKey: "sk_test" });

beforeEach(() => {
  server = createServer({ appData: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("auth MCP, from your backend", () => {
  it("makes an agent key", async () => {
    server.on("POST", `${base}/keys`, { status: 201, body: { id: "k1", hint: "…a1Qz", key: "scak_x" } });
    const { data } = await admin().createAgentKey("voice-bot", "ElevenLabs");
    expect(data?.key).toBe("scak_x");
    expect(server.callsTo("POST", `${base}/keys`)[0].body).toEqual({ name: "ElevenLabs" });
  });

  it("looks a conversation up and checks for its person, with the secret key", async () => {
    server.on("GET", `${base}/conversations/conv%2F1`, {
      body: { conversation_id: "conv/1", verified: true, person: { app_user_id: "u1", email: "jane@client.test" }, ended: false,
              task: { id: "t1", status: "open" } },
    });
    server.on("POST", `${base}/conversations/conv%2F1/check`, { body: { decision: "deny", allowed: false, reason: "x", say: "I'm not able to do that." } });

    const { data } = await admin().agentConversation("voice-bot", "conv/1");
    expect(data?.person?.email).toBe("jane@client.test");

    const { data: decision } = await admin().agentConversationCheck("voice-bot", "conv/1", { action: "reset_password", resource: "account" });
    expect(decision?.say).toBe("I'm not able to do that.");
    const [call] = server.callsTo("POST", `${base}/conversations/conv%2F1/check`);
    expect(call.headers["authorization"]).toBe("Bearer sk_test");
    expect(call.body).toEqual({ action: "reset_password", resource: "account" });
  });
});
