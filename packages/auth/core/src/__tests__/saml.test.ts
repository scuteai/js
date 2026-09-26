import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  (globalThis as any).window = globalThis;
  (globalThis as any).document = { createElement: () => ({}) };
  (globalThis as any).localStorage = new Map<string, string>();
  (globalThis as any).BroadcastChannel = class {
    addEventListener() {}
    removeEventListener() {}
    postMessage() {}
    close() {}
  };
});

const client = async () => {
  const { createClient } = await import("../ScuteClient");
  return createClient({
    appId: "app_saml",
    baseUrl: "https://api.test",
    preferences: { fingerprinting: false },
  } as any);
};

describe("SAML SSO", () => {
  it("builds the v2 SP-initiated login URL for the app", async () => {
    const c = await client();
    expect(c.getSamlLoginUrl()).toBe("https://api.test/v1/auth/app_saml/saml/login");
  });

  it("discoverSSO returns the discovery on a hit", async () => {
    const c = await client();
    const hit = { workspace_id: "ws_1", saml_login_url: "https://api.test/v1/auth/app_saml/saml/login", enforce_sso: true };
    vi.spyOn(c.admin, "discoverSSO").mockResolvedValue({ data: hit, error: null } as any);

    await expect(c.discoverSSO("a@acme.com")).resolves.toEqual(hit);
  });

  it("discoverSSO returns null on the uniform miss (no enumeration signal)", async () => {
    const c = await client();
    vi.spyOn(c.admin, "discoverSSO").mockResolvedValue({ data: null, error: { code: 404 } } as any);

    await expect(c.discoverSSO("a@unknown.com")).resolves.toBeNull();
  });
});
