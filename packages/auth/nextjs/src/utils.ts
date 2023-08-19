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
  let nextUrl: URL | string;

  try {
    nextUrl =
      //@ts-ignore
      req[
        Reflect.ownKeys(req).find(
          (key) => key.toString() === "Symbol(NextInternalRequestMeta)"
        )!
      ].__NEXT_INIT_URL;
  } catch {
    const protocol =
      (req?.socket as TLSSocket)?.encrypted ||
      req.headers["x-forwarded-proto"] === "https"
        ? "https"
        : "http";
    nextUrl = new URL(req.url!, `${protocol}://${req.headers.host}`);
  }

  return new URL(nextUrl);
}

export function randomBytes(length: number) {
  const arr = crypto.getRandomValues(new Uint8Array(length));
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}
