// RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30 second steps: what authenticator
// apps and the Scute API use) with node:crypto, so the suite can answer a
// TOTP enrollment and an MFA challenge like a phone would.

import { createHmac } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Not a base32 secret");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226) for one counter value. */
export function hotp(key: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", new Uint8Array(key)).update(new Uint8Array(msg)).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const code = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

export const totpStep = (timeMs = Date.now(), period = 30) => Math.floor(timeMs / 1000 / period);

/** The code for a base32 secret at a time (default now). */
export function totp(secret: string, { timeMs = Date.now(), period = 30, digits = 6 } = {}): string {
  return hotp(base32Decode(secret), totpStep(timeMs, period), digits);
}

/**
 * A code from a time step later than `afterStep`, waiting for the next step
 * when needed, so the same code is never sent twice.
 */
export async function freshTotp(secret: string, afterStep?: number): Promise<{ code: string; step: number }> {
  let step = totpStep();
  while (afterStep !== undefined && step <= afterStep) {
    const nextAt = (step + 1) * 30_000;
    await new Promise((r) => setTimeout(r, Math.max(nextAt - Date.now(), 0) + 250));
    step = totpStep();
  }
  return { code: hotp(base32Decode(secret), step), step };
}

/** RFC 6238 appendix B, SHA1, T = 59: 94287082 (8 digits). Checked before the suite relies on it. */
export function selfTest(): boolean {
  const key = Buffer.from("12345678901234567890", "ascii");
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  return hotp(key, totpStep(59_000), 8) === "94287082" && totp(secret, { timeMs: 1_111_111_109_000, digits: 8 }) === "07081804";
}
