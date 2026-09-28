// A tiny backend for the ElevenLabs server tools: POST /tools/:name with the
// tool's parameters as JSON (including conversation_id). Answers { say },
// which the agent reads out.
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { ScuteAdminApi } from "@scute/js-core";
import { runTool, type Directory } from "./tools";

const secret = process.env.TOOL_SECRET ?? "";
const scute = new ScuteAdminApi({
  appId: process.env.SCUTE_APP_ID!,
  secretKey: process.env.SCUTE_SECRET!,
  baseUrl: process.env.SCUTE_BASE_URL ?? "https://api.scute.io",
});

// Stand-in for your directory (Entra, Okta, your own users). Replace it.
const directory: Directory = {
  unlock: async (email) => console.log(`[directory] unlock ${email}`),
  resetPassword: async (email) => {
    console.log(`[directory] reset password for ${email} (temporary password emailed)`);
    return { temporaryPassword: "sent-by-email" };
  },
  createTicket: async (email, summary) => {
    const id = `HD-${Math.floor(1000 + Math.random() * 9000)}`;
    console.log(`[directory] ticket ${id} for ${email}: ${summary}`);
    return { id };
  },
};

const sameSecret = (given: string) =>
  secret.length > 0 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));

createServer(async (req, res) => {
  const match = req.method === "POST" && req.url?.match(/^\/tools\/([a-z_]+)$/);
  if (!match) return void res.writeHead(404).end();
  if (!sameSecret(String(req.headers["x-tool-secret"] ?? ""))) return void res.writeHead(401).end();

  let body = "";
  for await (const chunk of req) body += chunk;
  let args: Record<string, unknown> = {};
  try {
    args = body ? JSON.parse(body) : {};
  } catch {
    return void res.writeHead(400).end();
  }

  const result = await runTool(match[1], args, { scute, agent: process.env.SCUTE_AGENT ?? "helpdesk-voice", directory });
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result));
}).listen(Number(process.env.PORT ?? 8787), () => console.log(`Helpdesk tools on :${process.env.PORT ?? 8787}`));
