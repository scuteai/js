/**
 * Local decisions. The conformance vectors come from the Scute API's
 * engine (spec/fixtures/authz/conformance.json in scuteai/api); every one
 * must come out the same here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decideLocally, decodeSnapshotToken, verifySnapshotToken, type AuthzPolicy } from "../localAuthz";

const vectors = JSON.parse(readFileSync(join(__dirname, "fixtures/authz-conformance.json"), "utf8"));
const policy = vectors.policy as AuthzPolicy;

describe("conformance with the API engine", () => {
  it.each(vectors.cases as any[])("$name", (c: any) => {
    const got = decideLocally(policy, {
      roles: c.roles,
      user: c.user,
      action: c.action,
      resource: c.resource ?? undefined,
      context: c.context,
      now: c.now,
      strict: true,
    });

    expect({ decision: got.decision, reason: got.reason, permission: got.permission, roles: got.roles }).toEqual({
      decision: c.expect.decision,
      reason: c.expect.reason,
      permission: c.expect.permission,
      roles: c.expect.roles,
    });
    expect(got.allowed).toBe(c.expect.decision === "allow");
  });

  it("covers every kind of answer", () => {
    const reasons = new Set(vectors.cases.map((c: any) => c.expect.reason));
    for (const r of ["role_grant", "no_role_grants_permission", "condition_failed", "verification_required",
      "approval_required", "permission_disabled", "unknown_permission", "impersonating"]) {
      expect(reasons.has(r)).toBe(true);
    }
  });
});

describe("what a snapshot can't answer", () => {
  const withObjectRoles: AuthzPolicy = {
    ...policy,
    resources: { ...(policy.resources ?? {}), document: { roles: { owner: { permissions: ["document:edit"] } } } },
  };

  it("asks the server about roles on one object", () => {
    expect(decideLocally(withObjectRoles, { roles: [], action: "edit", resource: "document:42" }).decision).toBe("unknown");
    // No key: no object roles apply, so the local answer stands.
    expect(decideLocally(withObjectRoles, { roles: [], action: "edit", resource: "document" }).decision).toBe("deny");
  });

  it("asks the server when a condition reads an attribute you didn't pass, unless strict", () => {
    const check = { roles: ["clerk"], action: "approve", resource: "invoice" };
    expect(decideLocally(policy, check)).toMatchObject({ decision: "unknown", reason: "needs_server" });
    expect(decideLocally(policy, { ...check, strict: true })).toMatchObject({ decision: "deny", reason: "condition_failed" });
  });

  it("never allows on a step-up or approval", () => {
    expect(decideLocally(policy, { roles: ["editor"], action: "delete", resource: "document" }).allowed).toBe(false);
    expect(decideLocally(policy, { roles: ["clerk"], action: "pay", resource: "invoice" }).allowed).toBe(false);
  });
});

describe("verifySnapshotToken", () => {
  const b64url = (bytes: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

  async function signed(claims: Record<string, unknown>) {
    const pair = (await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"]
    )) as CryptoKeyPair;
    const head = enc({ alg: "RS256", kid: "k1" });
    const body = enc(claims);
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${head}.${body}`));
    const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };
    return { token: `${head}.${body}.${b64url(sig)}`, jwks: { keys: [jwk] } };
  }

  const claims = (over: Record<string, unknown> = {}) => ({
    typ: "scute-authz-snapshot", aud: "app_1", iat: 1, exp: Math.floor(Date.now() / 1000) + 600, version: 3, policy, ...over,
  });

  it("returns the claims for a good token", async () => {
    const { token, jwks } = await signed(claims());

    const out = await verifySnapshotToken(token, jwks, "app_1");

    expect(out.version).toBe(3);
    expect(decodeSnapshotToken(token).aud).toBe("app_1");
  });

  it("refuses tampering, another app, and expiry", async () => {
    const { token, jwks } = await signed(claims());
    const [h, , s] = token.split(".");
    const forged = `${h}.${enc(claims({ version: 99 }))}.${s}`;

    await expect(verifySnapshotToken(forged, jwks, "app_1")).rejects.toThrow(/signature/);
    await expect(verifySnapshotToken(token, jwks, "app_2")).rejects.toThrow(/another app/);
    const old = await signed(claims({ exp: 10 }));
    await expect(verifySnapshotToken(old.token, old.jwks, "app_1")).rejects.toThrow(/expired/);
  });
});
