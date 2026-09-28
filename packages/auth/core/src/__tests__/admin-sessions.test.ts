/**
 * The admin API's user-session calls hit the API-key routes
 * (/v1/:app_id/users/:id/sessions), not /v1/apps/... (which doesn't exist).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScuteAdminApi from "../ScuteAdminApi";
import { APP_ID, BASE_URL, createServer, type TestServer } from "./harness";

let server: TestServer;

beforeEach(() => {
  server = createServer({ appData: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const admin = () => new ScuteAdminApi({ appId: APP_ID, baseUrl: BASE_URL, secretKey: "sk_test" });

describe("admin: a user's sessions", () => {
  it("lists them", async () => {
    server.on("GET", `/v1/${APP_ID}/users/user_1/sessions`, { body: [{ id: "ses_1" }] });

    const { data, error } = await admin().listUserSessions("user_1");

    expect(error).toBeNull();
    expect(data).toEqual([{ id: "ses_1" }]);
    expect(server.callsTo("GET", `/v1/${APP_ID}/users/user_1/sessions`)[0].headers["authorization"]).toBe("Bearer sk_test");
  });

  it("revokes one", async () => {
    server.on("DELETE", `/v1/${APP_ID}/users/user_1/sessions/ses_1`, { status: 200, body: {} });

    const { error } = await admin().revokeUserSession("user_1", "ses_1");

    expect(error).toBeNull();
  });
});
