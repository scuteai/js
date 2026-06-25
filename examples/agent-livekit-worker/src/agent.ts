import "dotenv/config";
import { fileURLToPath } from "node:url";
import {
  cli,
  defineAgent,
  voice,
  llm,
  inference,
  WorkerOptions,
  type JobContext,
} from "@livekit/agents";
import * as silero from "@livekit/agents-plugin-silero";
import { z } from "zod";
// Monorepo dev: import the SDK source so this runs under tsx with no build.
// A real consumer would: import { ... } from "@scute/agent-guard".
import {
  loadAgentConfig,
  callManagedTool,
  type ManagedClientOptions,
} from "../../../packages/agent-guard/src/index";

// M05: a GENERIC, config-driven managed worker. It serves ANY agent — at startup
// it fetches the agent's config from Scute (M03) using the agent's own M2M token,
// builds its tools from that config, and routes every tool call through the
// HOSTED guard endpoint (Scute gates + forwards server-side). Deploy ONE of these
// to LiveKit Cloud Agents; Scute's launch dispatches it per agent.
//
// Env: SCUTE_API_URL, SCUTE_APP_ID, SCUTE_AGENT_ID, SCUTE_AGENT_TOKEN (the agent's
// M2M token, from launch). NOTE: written to the @livekit/agents v0.x API; the
// voice-pipeline boilerplate may need tweaks per your version — the Scute wiring
// (loadAgentConfig + callManagedTool) does not.
export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();

    const client: ManagedClientOptions = {
      baseUrl: process.env.SCUTE_API_URL!,
      appId: process.env.SCUTE_APP_ID!,
      agentId: process.env.SCUTE_AGENT_ID!,
      token: process.env.SCUTE_AGENT_TOKEN!,
    };

    const config = await loadAgentConfig(client);
    if (!config) throw new Error("could not load agent config from Scute");

    // Build the agent's tools from config; each routes through the hosted guard.
    const tools: Record<string, any> = {};
    for (const t of config.tools) {
      tools[t.name] = llm.tool({
        description: `Tool ${t.name}`,
        parameters: z.object({}).passthrough(),
        execute: async (args: Record<string, unknown>) => {
          const r = await callManagedTool(client, t.name, args);
          return r.ok ? JSON.stringify(r.output ?? {}) : r.message || "You are not permitted to do that.";
        },
      });
    }

    const agent = new voice.Agent({
      instructions: config.system_prompt || "You are a helpful assistant.",
      tools,
    });

    const session = new voice.AgentSession({
      stt: new inference.STT({ model: "deepgram/nova-3", language: "multi" }),
      llm: new inference.LLM({ model: config.model || "openai/gpt-4.1-mini" }),
      tts: new inference.TTS({ model: "cartesia/sonic-2" }),
      vad: await silero.VAD.load(),
    });

    await session.start({ agent, room: ctx.room });
    await session.generateReply({ instructions: "Greet the caller and offer to help." });
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
