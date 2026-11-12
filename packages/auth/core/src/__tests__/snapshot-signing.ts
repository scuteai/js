/**
 * Signs authz policy snapshots the way the API does (RS256 JWS, keys at
 * /v1/auth/:app_id/jwks), with the same RSA key setup as
 * lib/__tests__/local-authz.test.ts. Not a test file.
 */
const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  Buffer.from(new Uint8Array(bytes)).toString("base64url");
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

export type SnapshotSigner = {
  sign(claims: Record<string, unknown>, kid?: string): Promise<string>;
  jwks: { keys: (JsonWebKey & { kid?: string })[] };
};

export async function snapshotSigner(kid = "k1"): Promise<SnapshotSigner> {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid };
  return {
    jwks: { keys: [jwk] },
    async sign(claims, headerKid = kid) {
      const head = enc({ alg: "RS256", kid: headerKid });
      const body = enc(claims);
      const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${head}.${body}`));
      return `${head}.${body}.${b64url(sig)}`;
    },
  };
}
