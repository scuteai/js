import { ScuteClient, ScuteError } from "@scute/js-core";
import { createScuteClient } from "../shared";
import {
  APP_ID,
  BASE_URL,
  SECRET,
  createUpstream,
  makeAccess,
  settle,
  type Upstream,
} from "./_support";

let upstream: Upstream;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SCUTE_APP_ID", "");
  vi.stubEnv("NEXT_PUBLIC_SCUTE_BASE_URL", "");
  vi.stubEnv("SCUTE_SECRET", "");
  upstream = createUpstream().install();
});

afterEach(async () => {
  await settle();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createScuteClient: config resolution", () => {
  it("throws a ScuteError when neither appId nor NEXT_PUBLIC_SCUTE_APP_ID is set", () => {
    expect(() => createScuteClient({})).toThrow(ScuteError);
    expect(() => createScuteClient({})).toThrow(
      "either NEXT_PUBLIC_SCUTE_APP_ID or appId is required!"
    );
    expect(upstream.calls).toHaveLength(0);
  });

  it("falls back to NEXT_PUBLIC_SCUTE_APP_ID and NEXT_PUBLIC_SCUTE_BASE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SCUTE_APP_ID", APP_ID);
    vi.stubEnv("NEXT_PUBLIC_SCUTE_BASE_URL", BASE_URL);
    const client = createScuteClient({});
    expect(client).toBeInstanceOf(ScuteClient);
    expect(client.appId).toBe(APP_ID);
    expect(client.baseUrl).toBe(BASE_URL);
    expect(upstream.calls[0].url).toBe(`${BASE_URL}/v1/apps/${APP_ID}`);
  });

  it("prefers explicit config over env vars", () => {
    vi.stubEnv("NEXT_PUBLIC_SCUTE_APP_ID", "env-app");
    vi.stubEnv("NEXT_PUBLIC_SCUTE_BASE_URL", "https://env.example");
    const client = createScuteClient({ appId: APP_ID, baseUrl: BASE_URL });
    expect(client.appId).toBe(APP_ID);
    expect(client.baseUrl).toBe(BASE_URL);
  });

  it("defaults the base URL to https://api.scute.io", () => {
    const client = createScuteClient({ appId: APP_ID });
    expect(client.baseUrl).toBe("https://api.scute.io");
    expect(upstream.calls[0].url).toBe(`https://api.scute.io/v1/apps/${APP_ID}`);
  });

  it("sends the configured secret key as a Bearer token to the admin API (server)", () => {
    createScuteClient({ appId: APP_ID, baseUrl: BASE_URL, secretKey: SECRET });
    expect(upstream.calls[0].headers.get("authorization")).toBe(`Bearer ${SECRET}`);
  });

  it("falls back to SCUTE_SECRET on the server", () => {
    vi.stubEnv("SCUTE_SECRET", "env-secret");
    createScuteClient({ appId: APP_ID, baseUrl: BASE_URL });
    expect(upstream.calls[0].headers.get("authorization")).toBe("Bearer env-secret");
  });

  it("prefers config.secretKey over SCUTE_SECRET", () => {
    vi.stubEnv("SCUTE_SECRET", "env-secret");
    createScuteClient({ appId: APP_ID, baseUrl: BASE_URL, secretKey: SECRET });
    expect(upstream.calls[0].headers.get("authorization")).toBe(`Bearer ${SECRET}`);
  });

  it("sends no Authorization header when no secret is configured", () => {
    createScuteClient({ appId: APP_ID, baseUrl: BASE_URL });
    expect(upstream.calls[0].headers.has("authorization")).toBe(false);
  });

  it("forces persistSession: true, so a custom adapter is always used", () => {
    const adapter = {
      getItem: vi.fn(async () => null),
      setItem: vi.fn(async () => {}),
      removeItem: vi.fn(async () => {}),
    };
    const client = createScuteClient({
      appId: APP_ID,
      baseUrl: BASE_URL,
      preferences: { persistSession: false, sessionStorageAdapter: adapter } as any,
    });
    expect((client as any).config.persistSession).toBe(true);
    expect((client as any).scuteStorage).toBe(adapter);
  });
});

describe("createScuteClient: no-store fetch middleware", () => {
  it("marks later requests on the client wretcher as cache: no-store", async () => {
    const client = createScuteClient({ appId: APP_ID, baseUrl: BASE_URL, secretKey: SECRET });
    await (client as any).getCurrentUser(makeAccess());
    const call = upstream.callsTo("/current_user", "GET")[0];
    expect(call).toBeDefined();
    expect(call.cache).toBe("no-store");
  });

  it("marks later requests on the admin wretcher as cache: no-store", async () => {
    const client = createScuteClient({ appId: APP_ID, baseUrl: BASE_URL, secretKey: SECRET });
    await client.admin.getAppData();
    const appCalls = upstream.callsTo(`/v1/apps/${APP_ID}`, "GET");
    expect(appCalls).toHaveLength(2);
    expect(appCalls[1].cache).toBe("no-store");
  });

  it("marks the constructor's first app-data request (which carries the secret key) as no-store", () => {
    createScuteClient({ appId: APP_ID, baseUrl: BASE_URL, secretKey: SECRET });
    expect(upstream.calls).toHaveLength(1);
    expect(upstream.calls[0].path).toBe(`/v1/apps/${APP_ID}`);
    expect(upstream.calls[0].headers.get("authorization")).toBe(`Bearer ${SECRET}`);
    expect(upstream.calls[0].cache).toBe("no-store");
  });

  it("marks requests on the verifications wretcher as no-store", async () => {
    const client = createScuteClient({ appId: APP_ID, baseUrl: BASE_URL, secretKey: SECRET });
    await (client.verifications as any).get("/probe");
    const call = upstream.callsTo("/probe")[0];
    expect(call).toBeDefined();
    expect(call.cache).toBe("no-store");
  });

  it("still runs a caller's onBeforeInitialize, with the client as `this`, before the first request", () => {
    let self: unknown;
    let callsSeen = -1;
    const client = createScuteClient({
      appId: APP_ID,
      baseUrl: BASE_URL,
      onBeforeInitialize() {
        self = this;
        callsSeen = upstream.calls.length;
      },
    });
    expect(self).toBe(client);
    expect(callsSeen).toBe(0);
  });
});

describe("createScuteClient: browser", () => {
  beforeEach(() => {
    const doc = { createElement: () => ({}), visibilityState: "hidden" };
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", {
      document: doc,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });

  it("drops the secret key in the browser even if passed explicitly", async () => {
    vi.stubEnv("SCUTE_SECRET", "env-secret");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = createScuteClient({
      appId: APP_ID,
      baseUrl: BASE_URL,
      secretKey: SECRET,
      preferences: { fingerprinting: false, refetchInverval: 0 } as any,
    });
    await settle();
    expect(upstream.calls[0].headers.has("authorization")).toBe(false);
    for (const c of upstream.calls) {
      expect(c.headers.get("authorization") ?? "").not.toContain(SECRET);
      expect(c.headers.get("authorization") ?? "").not.toContain("env-secret");
    }
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("DANGER"));
    (client as any).channel?.close();
    warn.mockRestore();
  });
});
