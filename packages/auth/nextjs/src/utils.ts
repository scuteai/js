import type { NextApiRequest } from "next";
import type { TLSSocket } from "tls";

export async function getBody(
  req: Request
): Promise<Record<string, any> | undefined> {
  if (!("body" in req) || !req.body || req.method !== "POST") return;

  const contentType = req.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    try {
      return await req.json();
    } catch {
      return {};
    }
  } else if (contentType?.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(await req.text());
    return Object.fromEntries(params);
  }
}

export function getInitUrl(req: NextApiRequest) {
  const metaKey = Reflect.ownKeys(req).find(
    (key) => key.toString() === "Symbol(NextInternalRequestMeta)"
  );
  const meta = metaKey ? (req as any)[metaKey] : undefined;
  // Next 13 stores `__NEXT_INIT_URL`, Next 14+ stores `initURL`.
  const initUrl = meta?.initURL ?? meta?.__NEXT_INIT_URL;

  if (typeof initUrl === "string" && initUrl) {
    try {
      return new URL(initUrl);
    } catch {
      // not an absolute URL, use the request URL below
    }
  }

  const protocol =
    (req?.socket as TLSSocket)?.encrypted ||
    req.headers["x-forwarded-proto"] === "https"
      ? "https"
      : "http";
  return new URL(req.url ?? "/", `${protocol}://${req.headers.host}`);
}

/**
 * Decodes the payload of a compact JWT without verifying it. Returns null
 * for anything that is not three base64url segments with a JSON object
 * payload. Uses only atob/TextDecoder so it runs on Node and Edge.
 */
export function decodeJwtPayload(
  token: string
): Record<string, unknown> | null {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    return null;
  }

  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "===".slice((base64.length + 3) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : null;
  } catch {
    return null;
  }
}

export function randomBytes(length: number) {
  const arr = crypto.getRandomValues(new Uint8Array(length));
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type Promisable<T> = T | Promise<T>;