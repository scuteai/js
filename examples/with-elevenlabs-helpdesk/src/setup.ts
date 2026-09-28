// One-shot setup: the policy, the agent, and a key for ElevenLabs.
//   cp env.example .env && pnpm setup
import { readFileSync } from "node:fs";
import { ScuteAdminApi } from "@scute/js-core";

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} (see env.example)`);
  return value;
};

const appId = env("SCUTE_APP_ID");
const secret = env("SCUTE_SECRET");
const baseUrl = process.env.SCUTE_BASE_URL ?? "https://api.scute.io";
const agent = process.env.SCUTE_AGENT ?? "helpdesk-voice";

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}/v1/apps/${appId}${path}`, {
    method,
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 422) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(data)}`);
  return { status: res.status, data };
}

// 1. The policy (importing it twice changes nothing).
const document = JSON.parse(readFileSync(new URL("../policy.json", import.meta.url), "utf8"));
const imported = await api("POST", "/authz/policy/import", { document, dry_run: false });
console.log(`Policy: ${imported.data.changes?.length ?? 0} change(s)`);

// 2. The agent, with its role as the ceiling of what it can do for anyone.
const created = await api("POST", "/authz/agents", { slug: agent, name: "Helpdesk voice agent", roles: [agent] });
console.log(created.status === 422 ? `Agent ${agent} already exists` : `Agent ${agent} registered`);

// 3. A key for ElevenLabs (shown once).
const scute = new ScuteAdminApi({ appId, secretKey: secret, baseUrl });
const { data: key, error } = await scute.createAgentKey(agent, "ElevenLabs");
if (error || !key) throw new Error(`Couldn't make a key: ${error?.message}`);

console.log(`
In ElevenLabs (Agent > Tools):
  1. Add MCP server
       URL:    ${baseUrl}/v1/mcp/auth/${appId}
       Header: Authorization: Bearer ${key.key}     (a secret; shown once)
  2. Add the server tools from elevenlabs/tools.json, pointing at this backend
     (header X-Tool-Secret: your TOOL_SECRET).
  3. Paste elevenlabs/prompt.md as the system prompt.
`);
