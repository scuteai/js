import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

type FetchHandler = (req: Request) => Promise<Response>;

/** Serve a fetch handler with node:http: `http.createServer(nodeListener(gateway.handle))`. */
export function nodeListener(handler: FetchHandler, options: { trustProxy?: boolean } = {}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const proto = options.trustProxy ? String(req.headers["x-forwarded-proto"] ?? "http").split(",")[0] : "http";
      const host = (options.trustProxy && req.headers["x-forwarded-host"]) || req.headers.host || "localhost";
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
        else if (v !== undefined) headers.set(k, v);
      }
      const hasBody = req.method !== "GET" && req.method !== "HEAD";
      const request = new Request(`${proto}://${host}${req.url ?? "/"}`, {
        method: req.method,
        headers,
        body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream) : undefined,
        // @ts-expect-error: Node's fetch needs duplex for a streamed body
        duplex: hasBody ? "half" : undefined,
      });
      const response = await handler(request);
      const out: Record<string, string> = {};
      response.headers.forEach((value, name) => { out[name] = value; });
      res.writeHead(response.status, out);
      if (!response.body) return res.end();
      Readable.fromWeb(response.body as never).pipe(res);
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "gateway_error", error_description: (e as Error).message }));
    }
  };
}
