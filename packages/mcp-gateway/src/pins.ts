// Tool pinning: a tool's definition (name, description, schemas,
// annotations) hashed, so a server that changes a tool after you trusted it
// can't slip new instructions or arguments past you.

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: unknown;
  [key: string]: unknown;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function toolHash(tool: McpTool): Promise<string> {
  const { name, description, inputSchema, outputSchema, annotations } = tool;
  const data = new TextEncoder().encode(stable({ name, description, inputSchema, outputSchema, annotations }));
  const g = globalThis as { crypto?: Crypto };
  const subtle = g.crypto?.subtle ?? ((await import("node:crypto")).webcrypto as unknown as Crypto).subtle;
  const digest = new Uint8Array(await subtle.digest("SHA-256", data));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}
