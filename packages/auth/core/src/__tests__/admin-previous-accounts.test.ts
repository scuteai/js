/**
 * A deleted person who signs in again gets a fresh account; their old one can
 * be listed and merged in from your backend.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScuteAdminApi from "../ScuteAdminApi";
import { APP_ID, BASE_URL, createServer, type TestServer } from "./harness";

let server: TestServer;
const admin = () => new ScuteAdminApi({ appId: APP_ID, baseUrl: BASE_URL, secretKey: "sk_test" });

beforeEach(() => {
  server = createServer({ appData: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("previous accounts", () => {
  it("lists a person's deleted accounts and merges one in, with the secret key", async () => {
    const base = `/v1/${APP_ID}/users/u2`;
    server.on("GET", `${base}/previous_accounts`, {
      body: { previous_accounts: [{ id: "u1", status: "active", created_at: "x", deleted_at: "y", roles: 1, passkeys: 0, mfa_methods: ["totp"] }] },
    });
    server.on("POST", `${base}/merge`, { body: { user_id: "u2", merged: "u1", moved: { roles: 1 } } });

    const { data } = await admin().previousAccounts("u2");
    expect(data?.[0]).toMatchObject({ id: "u1", mfa_methods: ["totp"] });

    const { data: merged } = await admin().mergeUser("u2", "u1");
    expect(merged?.moved.roles).toBe(1);
    const [call] = server.callsTo("POST", `${base}/merge`);
    expect(call.headers["authorization"]).toBe("Bearer sk_test");
    expect(call.body).toEqual({ from: "u1" });
  });

  it("getUserByUserId reads the user with the secret key (it used to hit a route that only takes an identifier)", async () => {
    server.on("GET", `/v1/${APP_ID}/users/u2`, { body: { user: { id: "u2" } } });
    const { data } = await admin().getUserByUserId("u2");
    expect(data?.user?.id).toBe("u2");
    expect(server.callsTo("GET", `/v1/${APP_ID}/users/u2`)[0].headers["authorization"]).toBe("Bearer sk_test");
  });
});
