/** ScuteLocalAuthz: verified snapshot refresh, role cache, fallback to the API. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import ScuteAdminApi from "../ScuteAdminApi";
import ScuteLocalAuthz from "../ScuteLocalAuthz";
import { APP_ID, BASE_URL, createServer, nowSeconds, type TestServer } from "./harness";
import { snapshotSigner, type SnapshotSigner } from "./snapshot-signing";

let server: TestServer;
let signer: SnapshotSigner;
let attacker: SnapshotSigner;

const SNAPSHOT = `/v1/apps/${APP_ID}/authz/snapshot`;
const JWKS = `/v1/auth/${APP_ID}/jwks`;
const CHECK = `/v1/auth/${APP_ID}/authz/check`;

const policyWith = (roles: Record<string, unknown>) => ({
  permissions: { "document:read": { enabled: true }, "document:edit": { enabled: true } },
  roles,
  resources: { document: { roles: { owner: { permissions: ["document:edit"] } } } },
});

const snapshot = async (
  version: number,
  roles: Record<string, unknown>,
  { by = signer, claims = {} }: { by?: SnapshotSigner; claims?: Record<string, unknown> } = {}
) => ({
  version,
  jwks: JWKS,
  token: await by.sign({
    typ: "scute-authz-snapshot",
    aud: APP_ID,
    iat: nowSeconds(),
    exp: nowSeconds() + 3600,
    version,
    policy: policyWith(roles),
    ...claims,
  }),
});

const reader = { reader: { permissions: ["document:read"] } };

beforeAll(async () => {
  signer = await snapshotSigner();
  attacker = await snapshotSigner();
});

beforeEach(async () => {
  server = createServer({ appData: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  server.on("GET", SNAPSHOT, { body: await snapshot(1, reader) });
  server.on("GET", JWKS, { body: signer.jwks });
  server.on("GET", `/v1/auth/${APP_ID}/authz/users/u1/permissions`, { body: { user_id: "u1", roles: ["reader"], permissions: [], step_up: [] } });
  server.on("POST", CHECK, { body: { decision: "allow", allowed: true, reason: "resource_role" } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const admin = () => new ScuteAdminApi({ appId: APP_ID, baseUrl: BASE_URL, secretKey: "sk" });

describe("ScuteLocalAuthz", () => {
  it("decides locally from a verified snapshot and caches roles", async () => {
    const authz = new ScuteLocalAuthz(admin());

    expect((await authz.check({ userId: "u1", action: "read", resource: "document" }))?.decision).toBe("allow");
    expect((await authz.check({ userId: "u1", action: "edit", resource: "document" }))?.decision).toBe("deny");

    expect(server.callsTo("GET", SNAPSHOT)).toHaveLength(1);
    expect(server.callsTo("GET", JWKS)).toHaveLength(1);
    expect(server.callsTo("GET", `/v1/auth/${APP_ID}/authz/users/u1/permissions`)).toHaveLength(1);
    expect(server.callsTo("POST", CHECK)).toHaveLength(0);
    expect(authz.policyVersion).toBe(1);
  });

  it("asks the API about roles on one object", async () => {
    const authz = new ScuteLocalAuthz(admin());

    const d = await authz.check({ userId: "u1", action: "edit", resource: "document:42" });

    expect(d?.reason).toBe("resource_role");
    expect(server.callsTo("POST", CHECK)[0].body).toMatchObject({ user_id: "u1", resource: "document:42" });
  });

  it("asks the API when a condition reads an attribute the caller didn't pass (non-strict)", async () => {
    // The API has document 42's stored attributes (locked_by: "u9"), so its condition fails.
    server.on("GET", SNAPSHOT, {
      body: await snapshot(1, {
        reader: { permissions: ["document:edit"], conditions: { "document:edit": { not: { exists: { var: "resource.locked_by" } } } } },
      }),
    });
    server.on("POST", CHECK, { body: { decision: "deny", allowed: false, reason: "condition_failed" } });

    const d = await new ScuteLocalAuthz(admin()).check({ userId: "u1", action: "edit", resource: "document:42" });

    expect({ decision: d?.decision, serverChecks: server.callsTo("POST", CHECK).length }).toEqual({ decision: "deny", serverChecks: 1 });
  });

  it("refreshes a stale snapshot in the background", async () => {
    const authz = new ScuteLocalAuthz(admin(), { refreshMs: 0 });
    await authz.check({ userId: "u1", action: "read", resource: "document" });
    server.on("GET", SNAPSHOT, { body: await snapshot(2, { reader: { permissions: ["document:read", "document:edit"] } }) });

    // This check answers from version 1 and starts the refresh; nothing else triggers it.
    expect((await authz.check({ userId: "u1", action: "edit", resource: "document" }))?.decision).toBe("deny");
    await vi.waitFor(() => expect(authz.policyVersion).toBe(2));

    expect(server.callsTo("GET", SNAPSHOT)).toHaveLength(2);
    expect((await authz.check({ userId: "u1", action: "edit", resource: "document" }))?.decision).toBe("allow");
  });

  describe("snapshot verification (fails closed to the API)", () => {
    const grantsEdit = { reader: { permissions: ["document:read", "document:edit"] } };

    it("never decides from a snapshot signed by another key", async () => {
      server.on("GET", SNAPSHOT, { body: await snapshot(1, grantsEdit, { by: attacker }) });
      server.on("POST", CHECK, { body: { decision: "deny", allowed: false, reason: "no_role_grants_permission" } });
      const authz = new ScuteLocalAuthz(admin());

      const d = await authz.check({ userId: "u1", action: "edit", resource: "document" });

      expect(d?.decision).toBe("deny");
      expect(server.callsTo("POST", CHECK)).toHaveLength(1);
      expect(authz.policyVersion).toBeNull();
      await expect(authz.refresh()).rejects.toThrow(/signature/);
    });

    it("never decides from an unsigned token", async () => {
      const real = await snapshot(1, grantsEdit);
      const [h, p] = real.token.split(".");
      server.on("GET", SNAPSHOT, { body: { ...real, token: `${h}.${p}.sig` } });
      const authz = new ScuteLocalAuthz(admin());

      await authz.check({ userId: "u1", action: "edit", resource: "document" });

      expect(server.callsTo("POST", CHECK)).toHaveLength(1);
      expect(authz.policyVersion).toBeNull();
    });

    it("rejects a snapshot for another app, or one already expired", async () => {
      const authz = new ScuteLocalAuthz(admin());
      server.on("GET", SNAPSHOT, { body: await snapshot(1, grantsEdit, { claims: { aud: "app_other" } }) });
      await expect(authz.refresh()).rejects.toThrow(/another app/);
      server.on("GET", SNAPSHOT, { body: await snapshot(1, grantsEdit, { claims: { exp: nowSeconds() - 1 } }) });
      await expect(authz.refresh()).rejects.toThrow(/expired/);
      expect(authz.policyVersion).toBeNull();
    });

    it("asks the API when the JWKS can't be fetched", async () => {
      server.on("GET", JWKS, { status: 500, body: { error: "down" } });
      const authz = new ScuteLocalAuthz(admin());

      await authz.check({ userId: "u1", action: "read", resource: "document" });

      expect(server.callsTo("POST", CHECK)).toHaveLength(1);
    });

    it("fetches the JWKS again once when the signing key rotates", async () => {
      const authz = new ScuteLocalAuthz(admin());
      await authz.refresh();
      const rotated = await snapshotSigner("k2");
      server.on("GET", JWKS, { body: rotated.jwks });
      server.on("GET", SNAPSHOT, { body: await snapshot(2, reader, { by: rotated }) });

      await authz.refresh();

      expect(authz.policyVersion).toBe(2);
      expect(server.callsTo("GET", JWKS)).toHaveLength(2);
    });
  });

  describe("staleness", () => {
    it("stops deciding locally once the snapshot is older than maxStaleMs and refreshes keep failing", async () => {
      vi.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
      const authz = new ScuteLocalAuthz(admin(), { refreshMs: 1_000, maxStaleMs: 10_000 });
      await authz.check({ userId: "u1", action: "read", resource: "document" });
      server.on("GET", SNAPSHOT, { status: 500, body: { error: "down" } });

      vi.setSystemTime(Date.now() + 5_000);
      expect((await authz.check({ userId: "u1", action: "edit", resource: "document" }))?.decision).toBe("deny"); // local, still fresh enough
      expect(server.callsTo("POST", CHECK)).toHaveLength(0);

      vi.setSystemTime(Date.now() + 10_000);
      expect((await authz.check({ userId: "u1", action: "edit", resource: "document" }))?.reason).toBe("resource_role"); // the API
      expect(server.callsTo("POST", CHECK)).toHaveLength(1);
    });

    it("never answers from a snapshot past its exp", async () => {
      vi.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
      server.on("GET", SNAPSHOT, { body: await snapshot(1, reader, { claims: { exp: nowSeconds() + 60 } }) });
      const authz = new ScuteLocalAuthz(admin(), { refreshMs: 600_000, maxStaleMs: 600_000 });
      await authz.check({ userId: "u1", action: "read", resource: "document" });
      server.on("GET", SNAPSHOT, { status: 500, body: { error: "down" } });

      vi.setSystemTime(Date.now() + 61_000);
      await authz.check({ userId: "u1", action: "read", resource: "document" });

      expect(server.callsTo("POST", CHECK)).toHaveLength(1);
    });
  });
});
