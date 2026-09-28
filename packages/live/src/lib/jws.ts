// Verifying a compact JWS against a JWKS with node:crypto (RS256, ES256 and
// EdDSA: what Scute's key-pair properties sign with). The suite verifies
// what an agent signed exactly as a third party would, from the public keys.

import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

export type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

export type Verified = { ok: true; header: Record<string, any>; claims: Record<string, any> } | { ok: false; reason: string };

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

export function verifyJws(jws: string, jwks: { keys: Jwk[] }): Verified {
  const parts = jws.split(".");
  if (parts.length !== 3) return { ok: false, reason: "not a compact JWS" };
  let header: Record<string, any>;
  let claims: Record<string, any>;
  try {
    header = decode(parts[0]);
    claims = decode(parts[1]);
  } catch {
    return { ok: false, reason: "undecodable" };
  }
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, reason: `no key ${String(header.kid)}` };

  const key = createPublicKey({ key: jwk, format: "jwk" });
  const data = new Uint8Array(Buffer.from(`${parts[0]}.${parts[1]}`));
  const signature = new Uint8Array(Buffer.from(parts[2], "base64url"));
  let valid: boolean;
  switch (header.alg) {
    case "RS256":
      valid = verify("sha256", data, key, signature);
      break;
    case "ES256":
      valid = verify("sha256", data, { key, dsaEncoding: "ieee-p1363" }, signature);
      break;
    case "EdDSA":
      valid = verify(null, data, key, signature);
      break;
    default:
      return { ok: false, reason: `unsupported alg ${String(header.alg)}` };
  }
  return valid ? { ok: true, header, claims } : { ok: false, reason: "bad signature" };
}
