/**
 * Shared harness for the ScuteClient characterization suite (REF-17).
 *
 * Not a test file (no .test.ts suffix), so vitest does not collect it.
 * It imports nothing from the SDK on purpose: test files import the SDK
 * themselves, so there is only ever one copy of each module per file.
 *
 * Internal touchpoints (things a refactor may rename) are kept in this file
 * so that updating them is a one-place change:
 *   - recordEvents(): the client's mitt emitter (`emitter`)
 *   - ready(): the memoized `_initialize()` promise
 *   - internals(): raw access to protected/private members
 */
import { vi } from "vitest";

export const APP_ID = "app_test";
export const BASE_URL = "https://api.test";
export const AUTH_PREFIX = `/v1/auth/${APP_ID}`;

/** Storage keys as they are written today (namespaced with `__<appId>`). */
export const KEYS = {
  access: `sc-access-token__${APP_ID}`,
  refresh: `sc-refresh-token__${APP_ID}`,
  cred: `sct_cred_data__${APP_ID}`,
  lastLogin: `sct_last_login__${APP_ID}`,
  legacyAccess: "sc-access-token",
  legacyRefresh: "sc-refresh-token",
  legacyCred: "sct_cred_data",
  legacyLastLogin: "sct_last_login",
} as const;

// ─── JWT fixtures ────────────────────────────────────────────────────────

const b64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

/** Unsigned JWT-shaped string. The SDK never verifies signatures. */
export const makeJwt = (payload: Record<string, unknown>) =>
  `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.signature`;

export const nowSeconds = () => Math.floor(Date.now() / 1000);

export const accessToken = ({
  uuid = "user_1",
  expiresIn = 3600,
  ...extra
}: { uuid?: string | number; expiresIn?: number } & Record<string, unknown> = {}) =>
  makeJwt({ uuid, exp: nowSeconds() + expiresIn, ...extra });

export const refreshToken = ({
  expiresIn = 30 * 24 * 3600,
  ...extra
}: { expiresIn?: number } & Record<string, unknown> = {}) =>
  makeJwt({ exp: nowSeconds() + expiresIn, ...extra });

export const magicLinkToken = (extra: Record<string, unknown> = {}) =>
  makeJwt({
    uuid: "user_1",
    user_status: "active",
    webauthnEnabled: false,
    email: "ada@example.com",
    ...extra,
  });

// ─── Server fixtures ─────────────────────────────────────────────────────

export const appDataFixture = (overrides: Record<string, unknown> = {}) => ({
  id: APP_ID,
  name: "Test App",
  auto_refresh: true,
  email_auth_type: "magic",
  passkeys_enabled: true,
  base_url: "https://app.test",
  ...overrides,
});

export const userFixture = (overrides: Record<string, unknown> = {}) => ({
  id: "user_1",
  email: "ada@example.com",
  phone: null,
  status: "active",
  email_verified: true,
  phone_verified: false,
  webauthn_enabled: false,
  ...overrides,
});

// ─── Storage adapter ─────────────────────────────────────────────────────

type StorageOp = {
  op: "set" | "remove";
  key: string;
  value?: string;
  options?: Record<string, unknown>;
};

/** Async key/value adapter usable as `preferences.sessionStorageAdapter`. */
export class MemoryAdapter {
  readonly map = new Map<string, string>();
  readonly ops: StorageOp[] = [];

  async getItem(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async setItem(key: string, value: string, options?: any): Promise<void> {
    this.ops.push({ op: "set", key, value, options });
    this.map.set(key, value);
  }
  async removeItem(key: string, options?: any): Promise<void> {
    this.ops.push({ op: "remove", key, options });
    this.map.delete(key);
  }
  seed(key: string, value: string) {
    this.map.set(key, value);
    return this;
  }
  snapshot() {
    return Object.fromEntries(this.map.entries());
  }
}

/** Synchronous Storage lookalike for `window.localStorage`. */
export class FakeLocalStorage {
  readonly map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
  }
  snapshot() {
    return Object.fromEntries(this.map.entries());
  }
}

// ─── Fake HTTP server (stubs global fetch) ───────────────────────────────

export type RecordedCall = {
  url: string;
  path: string;
  query: URLSearchParams;
  method: string;
  /** lower-cased header names */
  headers: Record<string, string>;
  /** parsed JSON body when possible, raw otherwise */
  body: any;
  credentials?: RequestCredentials;
};

export type Reply =
  | Response
  | Error
  | {
      status?: number;
      statusText?: string;
      body?: unknown;
      /** raw string body, sent verbatim */
      raw?: string;
      headers?: Record<string, string>;
    };

type Handler = Reply | ((call: RecordedCall) => Reply | Promise<Reply>);

const toResponse = (reply: Reply): Response => {
  if (reply instanceof Response) return reply;
  if (reply instanceof Error) throw reply;
  const status = reply.status ?? 200;
  const noBody = status === 204 || status === 205 || status === 304;
  const payload = noBody
    ? null
    : reply.raw !== undefined
    ? reply.raw
    : reply.body === undefined
    ? null
    : JSON.stringify(reply.body);
  return new Response(payload, {
    status,
    statusText: reply.statusText,
    headers: { "Content-Type": "application/json", ...reply.headers },
  });
};

export function createServer({
  appData = appDataFixture(),
  appId = APP_ID,
}: { appData?: Record<string, unknown> | null; appId?: string } = {}) {
  const routes: Array<{
    method: string;
    path: string | RegExp;
    handler: Handler;
  }> = [];
  const calls: RecordedCall[] = [];

  const fetchMock = vi.fn(async (input: any, init: RequestInit = {}) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
    const parsed = new URL(url);
    let body: any = init.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        /* keep raw */
      }
    }
    const call: RecordedCall = {
      url,
      path: parsed.pathname,
      query: parsed.searchParams,
      method: (init.method ?? "GET").toUpperCase(),
      headers: Object.fromEntries(
        new Headers(init.headers as HeadersInit | undefined).entries()
      ),
      body,
      credentials: init.credentials,
    };
    calls.push(call);

    const route = routes.find(
      (r) =>
        r.method === call.method &&
        (typeof r.path === "string"
          ? r.path === call.path
          : r.path.test(call.path))
    );
    const reply: Reply = route
      ? typeof route.handler === "function"
        ? await route.handler(call)
        : route.handler
      : { status: 404, body: { error: "no route in test server" } };
    return toResponse(reply);
  });

  vi.stubGlobal("fetch", fetchMock);

  const server = {
    calls,
    fetch: fetchMock,
    /** Later registrations win over earlier ones. */
    on(method: string, path: string | RegExp, handler: Handler) {
      routes.unshift({ method, path, handler });
      return server;
    },
    callsTo(method: string, path: string | RegExp) {
      return calls.filter(
        (c) =>
          c.method === method &&
          (typeof path === "string" ? c.path === path : path.test(c.path))
      );
    },
  };

  if (appData) {
    server.on("GET", `/v1/apps/${appId}`, { body: appData });
  }

  return server;
}

export type TestServer = ReturnType<typeof createServer>;

// ─── Browser globals ─────────────────────────────────────────────────────

export class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  readonly posted: any[] = [];
  onmessage: ((msg: { data: any }) => void) | null = null;

  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }
  postMessage(data: unknown) {
    // Real BroadcastChannel structured-clones the payload.
    this.posted.push(structuredClone(data));
  }
  /** Simulate a message arriving from another tab. */
  deliver(data: unknown) {
    this.onmessage?.({ data });
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

/**
 * Makes `isBrowser()` true. Remember to call `vi.unstubAllGlobals()` in
 * afterEach. Visibility defaults to "hidden" so no auto-refresh ticker runs.
 */
export function installBrowser({
  href = "https://app.test/",
  visibilityState = "hidden",
  localStorage = new FakeLocalStorage(),
}: {
  href?: string;
  visibilityState?: "visible" | "hidden";
  localStorage?: FakeLocalStorage;
} = {}) {
  const document = { createElement: () => ({}), visibilityState };
  const win: any = {
    document,
    location: {
      href,
      hostname: new URL(href).hostname,
      toString() {
        return this.href;
      },
    },
    localStorage,
    navigator: { onLine: true },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  FakeBroadcastChannel.instances = [];
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", document);
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  return { win, document, localStorage };
}

// ─── Client helpers ──────────────────────────────────────────────────────

/** Browser-safe default preferences: no fingerprint import, no intervals. */
export const quietPreferences = {
  fingerprinting: false,
  refetchInverval: 0,
} as const;

export type AuthEvent = {
  event: string;
  session?: any;
  user?: any;
  _broadcasted?: boolean;
};

/** Records every auth event the client emits, in order. */
export function recordEvents(client: unknown) {
  const events: AuthEvent[] = [];
  (client as any).emitter.on("authStateChanged", (payload: AuthEvent) =>
    events.push(payload)
  );
  return {
    events,
    names: () => events.map((e) => e.event),
  };
}

/** Wait for the constructor-triggered initialization to settle. */
export const ready = (client: unknown): Promise<{ error: unknown }> =>
  (client as any)._initialize();

export const internals = (client: unknown) => client as any;

export const seedSession = (
  storage: { seed?: (k: string, v: string) => unknown; setItem?: any },
  tokens: { access?: string; refresh?: string }
) => {
  const put = (k: string, v: string) =>
    storage.seed ? storage.seed(k, v) : storage.setItem(k, v);
  if (tokens.access) put(KEYS.access, tokens.access);
  if (tokens.refresh) put(KEYS.refresh, tokens.refresh);
};

export const deferred = <T = void>() => {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/**
 * Runs `fn` while capturing unhandled promise rejections instead of letting
 * vitest fail the run on them. Used to assert that a code path does not leak
 * a rejection (see ScuteBaseHttp.delete). Real timers only.
 */
export async function captureUnhandledRejections(
  fn: () => Promise<unknown>,
  settleMs = 30
) {
  const captured: unknown[] = [];
  const saved = process.listeners("unhandledRejection");
  process.removeAllListeners("unhandledRejection");
  const handler = (reason: unknown) => {
    captured.push(reason);
  };
  process.on("unhandledRejection", handler);
  try {
    await fn();
    await new Promise((r) => setTimeout(r, settleMs));
  } finally {
    process.off("unhandledRejection", handler);
    for (const listener of saved) {
      process.on("unhandledRejection", listener as any);
    }
  }
  return captured;
}

/** Resolves "pending" if `promise` has not settled within `ms` (real timers). */
export const settledWithin = (promise: Promise<unknown>, ms = 50) =>
  Promise.race([
    promise.then(
      () => "settled",
      () => "settled"
    ),
    new Promise((r) => setTimeout(() => r("pending"), ms)),
  ]);
