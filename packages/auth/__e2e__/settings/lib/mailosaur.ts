// Real inboxes (Mailosaur, MAILOSAUR_SERVER_ID and MAILOSAUR_API_KEY): every
// address at <anything>@<server>.mailosaur.net lands in one server; a test
// waits for the next email sent to its own address.

import { settingsEnv } from "./fixtures";

const mailosaur = settingsEnv?.mailosaur ?? null;
export const hasInboxes = !!mailosaur;

const runId = Date.now().toString(36);
let counter = 0;

/** A new real address, never used before. */
export const newInbox = (tag: string) => `e2e-${runId}-${tag}-${++counter}@${mailosaur?.serverId}.mailosaur.net`.toLowerCase();

type Message = { id: string; subject: string; received: string; text?: { body?: string; codes?: { value: string }[] }; html?: { body?: string; codes?: { value: string }[] } };

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(`https://mailosaur.com/api${path}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${mailosaur!.apiKey}:`).toString("base64")}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as T };
}

// Messages a test already read, so a code is never taken twice.
const seen = new Set<string>();

/** The newest email to `address` received after `after`, not read before (polled). */
export async function waitForEmail(address: string, after: Date, timeoutMs = 90_000): Promise<Message> {
  const q = new URLSearchParams({ server: mailosaur!.serverId, receivedAfter: after.toISOString(), itemsPerPage: "5" });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await call<{ items?: { id: string }[]; message?: string }>("POST", `/messages/search?${q}`, { sentTo: address });
    if (found.status !== 200) throw new Error(`Mailosaur search ${found.status} ${found.json?.message ?? ""}`);
    const next = found.json.items?.find((m) => !seen.has(m.id));
    if (next) {
      seen.add(next.id);
      const { status, json } = await call<Message>("GET", `/messages/${next.id}`);
      if (status !== 200) throw new Error(`Mailosaur message ${status}`);
      return json;
    }
    if (Date.now() > deadline) throw new Error(`no email to ${address} within ${timeoutMs / 1000}s`);
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

/** The 6-digit code in the next email to `address` after `after`. */
export async function waitForCode(address: string, after: Date): Promise<string> {
  const message = await waitForEmail(address, after);
  // Scute's emails are HTML only: Mailosaur finds the code in either part.
  const parsed = [...(message.text?.codes ?? []), ...(message.html?.codes ?? [])].map((c) => c.value);
  const code = parsed.find((v) => /^\d{6}$/.test(v)) ?? /\b(\d{6})\b/.exec(`${message.subject}\n${message.text?.body ?? ""}`)?.[1];
  if (!code) throw new Error(`no 6-digit code in "${message.subject}"`);
  return code;
}
