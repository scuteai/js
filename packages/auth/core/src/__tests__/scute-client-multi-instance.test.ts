/**
 * ScuteClient multi-instance + BroadcastChannel tests.
 *
 * The "Multiple ScuteClient instances detected" warning used to fire for any
 * second client in the same JS context regardless of appId. Two Scute apps
 * coexisting on the same origin (the case we now support) hit it as a false
 * positive. After v0.7 the counter is per-appId — different apps coexist
 * silently, same-app duplication still warns.
 *
 * Same idea for BroadcastChannel: a per-app channel name means tab 1's
 * app-A sign-in event doesn't ping tab 2's app-B client.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createServer, FakeBroadcastChannel, installBrowser } from "./harness";

// The shared browser stub (vi.stubGlobal, undone in afterEach) makes
// `isBrowser()` true and records BroadcastChannels. `vi.resetModules()`
// clears the static per-appId instance map between tests by forcing a
// fresh module load, so the SDK is imported inside each test.
beforeEach(() => {
  vi.resetModules();
  // Stubbed fetch keeps the suite offline (the app data request gets a 404).
  createServer({ appData: null });
  installBrowser();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const channelNames = () => FakeBroadcastChannel.instances.map((c) => c.name);

describe("ScuteClient multi-instance warning", () => {
  it("does not warn for different appIds in the same context", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createClient } = await import("../ScuteClient");

    createClient({ appId: "app_A", preferences: { fingerprinting: false } });
    createClient({ appId: "app_B", preferences: { fingerprinting: false } });
    createClient({ appId: "app_C", preferences: { fingerprinting: false } });

    expect(warn).not.toHaveBeenCalled();
  });

  it("warns when the SAME appId is instantiated twice", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createClient } = await import("../ScuteClient");

    createClient({ appId: "app_X", preferences: { fingerprinting: false } });
    createClient({ appId: "app_X", preferences: { fingerprinting: false } });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/Multiple ScuteClient instances/);
    expect(warn.mock.calls[0][0]).toMatch(/app_X/);
  });

  it("counts per-appId independently — two clients of A + one of B warns once for A", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createClient } = await import("../ScuteClient");

    createClient({ appId: "app_A", preferences: { fingerprinting: false } });
    createClient({ appId: "app_B", preferences: { fingerprinting: false } });
    createClient({ appId: "app_A", preferences: { fingerprinting: false } }); // second A — warns

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/app_A/);
  });
});

describe("ScuteClient BroadcastChannel scoping", () => {
  it("opens a channel named sct_broadcast__<appId> per client", async () => {
    const { createClient } = await import("../ScuteClient");

    createClient({ appId: "app_alpha", preferences: { fingerprinting: false } });
    expect(channelNames()).toContain("sct_broadcast__app_alpha");
  });

  it("two clients with different appIds get different channels (no cross-talk)", async () => {
    const { createClient } = await import("../ScuteClient");

    createClient({ appId: "app_A", preferences: { fingerprinting: false } });
    createClient({ appId: "app_B", preferences: { fingerprinting: false } });

    expect(channelNames()).toContain("sct_broadcast__app_A");
    expect(channelNames()).toContain("sct_broadcast__app_B");
    expect(new Set(channelNames()).size).toBe(channelNames().length);
  });
});
