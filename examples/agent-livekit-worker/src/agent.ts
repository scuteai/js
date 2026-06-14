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
// Monorepo dev: import the SDK source directly so this runs under tsx with no
// build step. A real consumer would: import { ... } from "@scute/agent-guard".
import {
  AgentGuard,
  ScuteVerifier,
  guardedLiveKitTool,
  maxAmount,
  type Identity,
} from "../../../packages/agent-guard/src/index";
import { createOrderDb } from "./tools.js";

// NOTE: written to the @livekit/agents v0.x Node API (voice pipeline +
// llm.tool). If your installed version differs, the voice-pipeline boilerplate
// (AgentSession/Agent/tool registration) may need small tweaks — the Scute
// guard wiring below stays the same.
export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();
    const participant = await ctx.waitForParticipant();
    const attrs = (participant.attributes || {}) as Record<string, string>;

    const guard = new AgentGuard({
      verifier: new ScuteVerifier({
        baseUrl: process.env.SCUTE_API_URL!,
        appId: process.env.SCUTE_APP_ID!,
      }),
    });
    const db = createOrderDb();

    // Authorize as the user's Scute token (live resolution). Phone/anon callers
    // would start anonymous and bind via a verify_caller tool.
    const actor: string | Identity =
      attrs.scute_token || { kind: "anonymous", roles: [] };

    const lookup = guardedLiveKitTool(guard, actor, {
      name: "lookup_order",
      permission: "orders:read",
      run: (a: { id: number }) => db[a.id] ?? null,
    });
    const refund = guardedLiveKitTool(guard, actor, {
      name: "refund_order",
      permission: "orders:refund",
      layers: [maxAmount("amount", 500)],
      run: (a: { id: number }) => {
        db[a.id].status = "refunded";
        return { id: a.id, status: "refunded" };
      },
    });

    const agent = new voice.Agent({
      instructions:
        "You are a friendly support agent for an online store. Use lookup_order and refund_order to help. If a tool result says the caller is not permitted or needs verification, tell them plainly and do not retry.",
      tools: {
        lookup_order: llm.tool({
          description: "Look up an order by its id",
          parameters: z.object({ id: z.number() }),
          execute: async ({ id }) => JSON.stringify(await lookup({ id })),
        }),
        refund_order: llm.tool({
          description: "Refund an order by its id (optionally an amount)",
          parameters: z.object({ id: z.number(), amount: z.number().optional() }),
          execute: async ({ id, amount }) => JSON.stringify(await refund({ id, amount })),
        }),
      },
    });

    const session = new voice.AgentSession({
      stt: new inference.STT({ model: "deepgram/nova-3", language: "multi" }),
      llm: new inference.LLM({ model: "openai/gpt-4.1-mini" }),
      tts: new inference.TTS({ model: "cartesia/sonic-2" }),
      vad: await silero.VAD.load(),
    });

    await session.start({ agent, room: ctx.room });
    await session.generateReply({
      instructions: "Greet the caller and offer to help with their order.",
    });
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
