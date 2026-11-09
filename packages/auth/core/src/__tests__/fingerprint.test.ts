/**
 * The device fingerprint (X-Fingerprint) on requests that change something,
 * including one sent before the fingerprint finished loading.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

let resolveVisitor: (id: string) => void = () => {};
vi.mock("@fingerprintjs/fingerprintjs", () => ({
  load: async () => ({
    get: () => new Promise<{ visitorId: string }>((resolve) => (resolveVisitor = (id) => resolve({ visitorId: id }))),
  }),
}));

import { createClient } from "../ScuteClient";
import { APP_ID, AUTH_PREFIX, BASE_URL, createServer, installBrowser, quietPreferences } from "./harness";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Fake timers throughout: the waits are FINGERPRINT_WAIT_MS (2s) timers in
// the client, advanced explicitly, never real sleeps or wall-clock bounds.
const FINGERPRINT_WAIT_MS = 2000;

const setup = (method: string, path: string) => {
  vi.useFakeTimers();
  installBrowser({ href: "https://app.test/" });
  const server = createServer({});
  server.on(method, `${AUTH_PREFIX}${path}`, { body: {} });
  const client = createClient({ appId: APP_ID, baseUrl: BASE_URL, preferences: { ...quietPreferences, fingerprinting: true } });
  return { server, client: client as any };
};

describe("X-Fingerprint", () => {
  it("a request sent while the fingerprint loads waits for it and carries it", async () => {
    const { server, client } = setup("PATCH", "/magic_links/authenticate");

    const request = client.patch("/magic_links/authenticate", { token: "t" });
    await vi.advanceTimersByTimeAsync(FINGERPRINT_WAIT_MS - 1);
    expect(server.callsTo("PATCH", `${AUTH_PREFIX}/magic_links/authenticate`)).toHaveLength(0);

    resolveVisitor("visitor-1");
    await vi.advanceTimersByTimeAsync(0);
    await request;
    const [call] = server.callsTo("PATCH", `${AUTH_PREFIX}/magic_links/authenticate`);
    expect(call.headers["x-fingerprint"]).toBe("visitor-1");
  });

  it("holds a request at most FINGERPRINT_WAIT_MS when the fingerprint never loads", async () => {
    const { server, client } = setup("POST", "/thing");

    const request = client.post("/thing", {});
    await vi.advanceTimersByTimeAsync(FINGERPRINT_WAIT_MS - 1);
    expect(server.callsTo("POST", `${AUTH_PREFIX}/thing`)).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    await request;
    const [call] = server.callsTo("POST", `${AUTH_PREFIX}/thing`);
    expect(call.headers["x-fingerprint"]).toBeUndefined();
  });

  it("GET requests never wait", async () => {
    const { server, client } = setup("GET", "/thing");

    // No timer is advanced: a GET that waited for the fingerprint would hang.
    await client.get("/thing");
    expect(server.callsTo("GET", `${AUTH_PREFIX}/thing`)).toHaveLength(1);
  });
});
