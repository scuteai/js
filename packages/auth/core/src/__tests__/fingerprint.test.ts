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

describe("X-Fingerprint", () => {
  it("a request sent while the fingerprint loads waits for it and carries it", async () => {
    installBrowser({ href: "https://app.test/" });
    const server = createServer({});
    server.on("PATCH", `${AUTH_PREFIX}/magic_links/authenticate`, { status: 404, body: { error: "x" } });
    const client = createClient({ appId: APP_ID, baseUrl: BASE_URL, preferences: { ...quietPreferences, fingerprinting: true } });

    const request = (client as any).patch("/magic_links/authenticate", { token: "t" });
    await new Promise((r) => setTimeout(r, 50));
    expect(server.callsTo("PATCH", `${AUTH_PREFIX}/magic_links/authenticate`)).toHaveLength(0);

    resolveVisitor("visitor-1");
    await request;
    const [call] = server.callsTo("PATCH", `${AUTH_PREFIX}/magic_links/authenticate`);
    expect(call.headers["x-fingerprint"]).toBe("visitor-1");
  });

  it("does not hold a request for long when the fingerprint never loads", async () => {
    installBrowser({ href: "https://app.test/" });
    const server = createServer({});
    server.on("POST", `${AUTH_PREFIX}/thing`, { body: {} });
    const client = createClient({ appId: APP_ID, baseUrl: BASE_URL, preferences: { ...quietPreferences, fingerprinting: true } });

    const started = Date.now();
    await (client as any).post("/thing", {});
    expect(Date.now() - started).toBeLessThan(3000);
    const [call] = server.callsTo("POST", `${AUTH_PREFIX}/thing`);
    expect(call.headers["x-fingerprint"]).toBeUndefined();
  });

  it("GET requests never wait", async () => {
    installBrowser({ href: "https://app.test/" });
    const server = createServer({});
    server.on("GET", `${AUTH_PREFIX}/thing`, { body: {} });
    const client = createClient({ appId: APP_ID, baseUrl: BASE_URL, preferences: { ...quietPreferences, fingerprinting: true } });
    const started = Date.now();
    await (client as any).get("/thing");
    expect(Date.now() - started).toBeLessThan(500);
  });
});
