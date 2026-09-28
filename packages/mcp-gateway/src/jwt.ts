// Verifying Scute access tokens (RS256, typ at+jwt) against the app's JWKS
// with Web Crypto, so the gateway runs on Node, Bun, Deno and edge runtimes.

export type AccessTokenClaims = {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat?: number;
  jti?: string;
  scope?: string;
  client_id?: string;
  scute?: { grant?: string; app?: string };
};

type Jwk = { kty?: string; kid?: string; n?: string; e?: string };

let subtleImpl: SubtleCrypto | undefined;
async function subtle(): Promise<SubtleCrypto> {
  if (subtleImpl) return subtleImpl;
  const g = globalThis as { crypto?: Crypto };
  if (g.crypto?.subtle) subtleImpl = g.crypto.subtle;
  else subtleImpl = ((await import("node:crypto")).webcrypto as unknown as Crypto).subtle;
  return subtleImpl;
}

export function base64UrlBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const decodeJson = (s: string): Record<string, unknown> => JSON.parse(new TextDecoder().decode(base64UrlBytes(s)));

/** The app's signing keys, fetched on demand and re-fetched for an unknown kid (key rotation). */
export class Jwks {
  private keys = new Map<string, CryptoKey>();
  private fetchedAt = 0;

  constructor(private readonly url: string, private readonly fetchImpl: typeof fetch) {}

  async key(kid: string): Promise<CryptoKey | undefined> {
    if (!this.keys.has(kid) && Date.now() - this.fetchedAt > 30_000) await this.refresh();
    return this.keys.get(kid);
  }

  private async refresh() {
    this.fetchedAt = Date.now();
    const res = await this.fetchImpl(this.url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`Couldn't fetch the signing keys (${res.status})`);
    const body = (await res.json()) as { keys?: Jwk[] };
    const s = await subtle();
    const next = new Map<string, CryptoKey>();
    for (const jwk of body.keys ?? []) {
      if (jwk.kty !== "RSA" || !jwk.kid || !jwk.n || !jwk.e) continue;
      const key = await s.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      next.set(jwk.kid, key);
    }
    this.keys = next;
  }
}

/** The claims of a valid access token for this resource, or null. */
export async function verifyAccessToken(
  token: string,
  options: { jwks: Jwks; issuer: string; audience: string; now?: number; leeway?: number },
): Promise<AccessTokenClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = decodeJson(parts[0]);
    payload = decodeJson(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || header.typ !== "at+jwt" || typeof header.kid !== "string") return null;

  const key = await options.jwks.key(header.kid);
  if (!key) return null;
  const s = await subtle();
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await s.verify("RSASSA-PKCS1-v1_5", key, base64UrlBytes(parts[2]), signed);
  if (!valid) return null;

  const now = (options.now ?? Date.now()) / 1000;
  const leeway = options.leeway ?? 30;
  if (typeof payload.exp !== "number" || payload.exp + leeway < now) return null;
  if (payload.iss !== options.issuer) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(options.audience)) return null;
  if (typeof payload.sub !== "string") return null;
  return payload as unknown as AccessTokenClaims;
}
