// Server-sent events, as MCP's Streamable HTTP transport uses them.

export type SseEvent = { event?: string; id?: string; data: string };

export function parseSse(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const block of text.replace(/\r\n/g, "\n").split("\n\n")) {
    if (!block.trim()) continue;
    const ev: SseEvent = { data: "" };
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue;
      const i = line.indexOf(":");
      const field = i === -1 ? line : line.slice(0, i);
      const value = i === -1 ? "" : line.slice(i + 1).replace(/^ /, "");
      if (field === "data") data.push(value);
      else if (field === "event") ev.event = value;
      else if (field === "id") ev.id = value;
    }
    ev.data = data.join("\n");
    events.push(ev);
  }
  return events;
}

export function formatSse(events: SseEvent[]): string {
  return events
    .map((e) => {
      const lines: string[] = [];
      if (e.id !== undefined) lines.push(`id: ${e.id}`);
      if (e.event !== undefined) lines.push(`event: ${e.event}`);
      for (const line of e.data.split("\n")) lines.push(`data: ${line}`);
      return `${lines.join("\n")}\n\n`;
    })
    .join("");
}
