// Keeps one Rails runner on the API up for the whole run (starting one takes
// about half a minute) and lets the tests call the operations in server.rb
// over a small local HTTP server. Playwright starts it as a web server.
//
//   GET  /health  200 once the suite's app is ready
//   GET  /setup   { apiUrl, appId, secret }
//   POST /op      { op, args } -> the operation's answer
//   POST /pace    waits until a sign-in fits the API's per-minute limits

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { loadSettingsEnv } from "./env.mjs";

const env = loadSettingsEnv();
if (!env.ok) {
  console.error(`[settings broker] ${env.reason}`);
  process.exit(1);
}
const { apiUrl, consoleCommand, pagePort, brokerPort } = env.env;

const script = readFileSync(fileURLToPath(new URL("./server.rb", import.meta.url)), "utf8");
const bootstrap = `'eval(%q(${Buffer.from(script).toString("base64")}).unpack1(%q(m)).force_encoding(%q(UTF-8)))'`;
const command = consoleCommand.includes("{script}")
  ? consoleCommand.replace("{script}", bootstrap)
  : `${consoleCommand} ${bootstrap}`;

const child = spawn("sh", ["-c", command], { stdio: ["pipe", "pipe", "pipe"] });
child.on("exit", (code) => {
  console.error(`[settings broker] the API console exited (${code})`);
  process.exit(1);
});
child.stderr.on("data", () => {});

let buffer = "";
let ready = false;
const waiting = [];
let onReady;
const readyPromise = new Promise((r) => (onReady = r));

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl).replace(/\r$/, "");
    buffer = buffer.slice(nl + 1);
    if (line.includes("E2E_READY")) {
      ready = true;
      onReady();
    } else if (line.startsWith("E2E_RESULT ")) {
      const next = waiting.shift();
      if (next) next(JSON.parse(line.slice("E2E_RESULT ".length)));
    }
  }
});

// One request at a time, in order: the console answers lines in order.
let queue = Promise.resolve();
function op(name, args = []) {
  const run = () =>
    new Promise((resolve) => {
      waiting.push(resolve);
      child.stdin.write(`${JSON.stringify({ op: name, args })}\n`);
    });
  const result = queue.then(run);
  queue = result.catch(() => {});
  return result;
}

// Sign-ins look the identifier up 1 to 3 times; the API allows 30 lookups a
// minute per IP. Keep to 8 sign-ins a minute.
const SIGNINS_PER_MINUTE = 8;
const recent = [];
async function pace() {
  for (;;) {
    const now = Date.now();
    while (recent.length && now - recent[0] > 60_000) recent.shift();
    if (recent.length < SIGNINS_PER_MINUTE) {
      recent.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, 60_000 - (now - recent[0]) + 100));
  }
}

let setup = null;
let setupError = null;

const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (d) => (data += d));
    req.on("end", () => resolve(data ? JSON.parse(data) : {}));
  });

const server = createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  try {
    if (req.url === "/health") return setup ? send(200, { ok: true }) : send(503, { ok: false, error: setupError });
    if (req.url === "/setup") return setup ? send(200, setup) : send(503, { error: setupError ?? "starting" });
    if (req.url === "/op" && req.method === "POST") {
      const { op: name, args } = await readBody(req);
      return send(200, await op(name, args));
    }
    if (req.url === "/pace" && req.method === "POST") {
      await pace();
      return send(200, { ok: true });
    }
    send(404, { error: "not found" });
  } catch (e) {
    send(500, { error: String(e?.message ?? e) });
  }
});
server.listen(brokerPort, "127.0.0.1");

await readyPromise;
const made = await op("ensure_app", ["e2e-mfa sdk browser", `http://localhost:${pagePort}`]);
if (!made.ok) {
  setupError = made.e;
  console.error(`[settings broker] setup failed: ${made.e}`);
} else {
  setup = { apiUrl, appId: made.v.app_id, secret: made.v.secret };
  console.log(`[settings broker] ready: ${made.v.app_id}`);
}
void ready;
