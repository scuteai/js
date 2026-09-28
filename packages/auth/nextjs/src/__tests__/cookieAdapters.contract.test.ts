/**
 * One contract, run against every server-side cookie adapter. This is the
 * safety net for REF-42 (parameterize cookie adapters) and REF-41 (retire
 * the legacy cookie fallback): each row pins which cookies an adapter
 * reads/writes, their names (namespaced vs legacy) and their attributes.
 *
 * Session plumbing (setSession / removeSession / initialSessionState) is
 * js-core's; the adapters decide where those reads and writes land.
 */
import { IncomingMessage, ServerResponse } from "http";
import { Socket } from "net";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "../routeHandlerClient";
import { createServerActionClient } from "../serverActionClient";
import { createServerComponentClient } from "../serverComponentClient";
import { createMiddlewareClient } from "../middlewareClient";
import { createPagesServerClient } from "../pagesServerClient";
import { createPagesEdgeRuntimeClient } from "../pagesEdgeRuntimeClient";
import {
  ACCESS_KEY,
  LEGACY_ACCESS_KEY,
  LEGACY_REFRESH_KEY,
  OTHER_APP_ID,
  REFRESH_KEY,
  clientConfig,
  createUpstream,
  isDeletion,
  makeAccess,
  makeNextRequest,
  makeRefresh,
  makeRouteContext,
  makeSealedCookies,
  parseCookies,
  settle,
  type ParsedSetCookie,
} from "./_support";

type Harness = {
  name: string;
  /** whether writes reach something the browser will receive */
  persists: boolean;
  create: (
    cookies: Record<string, string>,
    extra?: Record<string, unknown>
  ) => {
    client: any;
    /** every Set-Cookie the adapter produced for the browser */
    writes: () => ParsedSetCookie[];
  };
};

const nodeRes = () => new ServerResponse(new IncomingMessage(new Socket()));
const nodeSetCookies = (res: ServerResponse) => {
  const v = res.getHeader("set-cookie");
  return v === undefined ? [] : Array.isArray(v) ? v.map(String) : [String(v)];
};

const harnesses: Harness[] = [
  {
    name: "routeHandlerClient",
    persists: true,
    create: (cookies, extra) => {
      const ctx = makeRouteContext(cookies);
      const client = createRouteHandlerClient({ cookies: ctx.context.cookies }, clientConfig(extra));
      return { client, writes: () => parseCookies(ctx.cookieHistory()) };
    },
  },
  {
    name: "serverActionClient",
    persists: true,
    create: (cookies, extra) => {
      const ctx = makeRouteContext(cookies);
      const client = createServerActionClient({ cookies: ctx.context.cookies }, clientConfig(extra));
      return { client, writes: () => parseCookies(ctx.cookieHistory()) };
    },
  },
  {
    name: "middlewareClient",
    persists: true,
    create: (cookies, extra) => {
      const req = makeNextRequest("/", { cookies });
      const res = NextResponse.next();
      const client = createMiddlewareClient({ req, res }, clientConfig(extra));
      return { client, writes: () => parseCookies(res.headers.getSetCookie()) };
    },
  },
  {
    name: "pagesServerClient",
    persists: true,
    create: (cookies, extra) => {
      const res = nodeRes();
      const req: any = { cookies, headers: {} };
      const client = createPagesServerClient({ req, res } as any, clientConfig(extra));
      return { client, writes: () => parseCookies(nodeSetCookies(res)) };
    },
  },
  {
    name: "serverComponentClient",
    persists: false,
    create: (cookies, extra) => {
      const sealed = makeSealedCookies(cookies);
      const client = createServerComponentClient({ cookies: () => sealed as any }, clientConfig(extra));
      return { client, writes: () => [] };
    },
  },
  {
    name: "pagesEdgeRuntimeClient",
    persists: false,
    create: (cookies, extra) => {
      const request = makeNextRequest("/", { cookies });
      const client = createPagesEdgeRuntimeClient({ request }, clientConfig(extra));
      // without a response, writes land on request.cookies only
      return { client, writes: () => [] };
    },
  },
  {
    name: "pagesEdgeRuntimeClient (with response)",
    persists: true,
    create: (cookies, extra) => {
      const request = makeNextRequest("/", { cookies });
      const response = new Response(null);
      const client = createPagesEdgeRuntimeClient({ request, response }, clientConfig(extra));
      return { client, writes: () => parseCookies(response.headers.getSetCookie()) };
    },
  },
];

const byName = (writes: ParsedSetCookie[], name: string) => writes.filter((c) => c.name === name);
const last = (writes: ParsedSetCookie[], name: string) => byName(writes, name).pop();
const expSec = (jwt: string) =>
  JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).exp as number;

beforeEach(() => {
  createUpstream().install();
});

afterEach(async () => {
  await settle();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe.each(harnesses)("$name: cookie contract", (h) => {
  describe("reads", () => {
    it("reads the namespaced access + refresh cookies", async () => {
      const access = makeAccess();
      const refresh = makeRefresh();
      const { client } = h.create({ [ACCESS_KEY]: access, [REFRESH_KEY]: refresh });
      const s = await client.initialSessionState();
      expect(s.status).toBe("authenticated");
      expect(s.access).toBe(access);
      expect(s.refresh).toBe(refresh);
      expect(s.accessExpiresAt.getTime()).toBe(expSec(access) * 1000);
      expect(s.refreshExpiresAt.getTime()).toBe(expSec(refresh) * 1000);
    });

    it("treats missing cookies as unauthenticated (access null, refresh undefined)", async () => {
      const { client, writes } = h.create({});
      const s = await client.initialSessionState();
      expect(s).toEqual({
        access: null,
        accessExpiresAt: null,
        refresh: undefined,
        refreshExpiresAt: undefined,
        status: "unauthenticated",
      });
      expect(writes()).toEqual([]);
    });

    it("treats an undecodable access cookie as unauthenticated but keeps the refresh token", async () => {
      const refresh = makeRefresh();
      const { client } = h.create({ [ACCESS_KEY]: "garbage", [REFRESH_KEY]: refresh });
      const s = await client.initialSessionState();
      expect(s.status).toBe("unauthenticated");
      expect(s.access).toBeNull();
      expect(s.refresh).toBe(refresh);
    });

    it("does not check exp: an expired access cookie still reads as authenticated", async () => {
      const { client } = h.create({ [ACCESS_KEY]: makeAccess({ expIn: -3600 }) });
      const s = await client.initialSessionState();
      expect(s.status).toBe("authenticated");
    });

    it("ignores another app's namespaced cookies", async () => {
      const { client } = h.create({
        [`sc-access-token__${OTHER_APP_ID}`]: makeAccess(),
        [`sc-refresh-token__${OTHER_APP_ID}`]: makeRefresh(),
      });
      const s = await client.initialSessionState();
      expect(s.status).toBe("unauthenticated");
      expect(s.refresh).toBeUndefined();
    });

    it("prefers namespaced over legacy when both exist", async () => {
      const ns = makeAccess({ tag: "ns" });
      const { client, writes } = h.create({ [ACCESS_KEY]: ns, [LEGACY_ACCESS_KEY]: makeAccess({ tag: "legacy" }) });
      const s = await client.initialSessionState();
      expect(s.access).toBe(ns);
      expect(writes()).toEqual([]);
    });

    // Known limitation, tracked separately (REF-41): with no namespaced
    // cookie, the legacy unsuffixed cookie is read and copied into this
    // app's namespace without Expires/Max-Age; the original is left alone.
    it("falls back to legacy unsuffixed cookies and forward-migrates them", async () => {
      const access = makeAccess({ tag: "legacy" });
      const refresh = makeRefresh({ tag: "legacy" });
      const { client, writes } = h.create({ [LEGACY_ACCESS_KEY]: access, [LEGACY_REFRESH_KEY]: refresh });
      const s = await client.initialSessionState();
      expect(s.access).toBe(access);
      expect(s.refresh).toBe(refresh);

      if (!h.persists) {
        expect(writes()).toEqual([]);
        return;
      }
      const a = last(writes(), ACCESS_KEY)!;
      const r = last(writes(), REFRESH_KEY)!;
      expect(a.value).toBe(access);
      expect(r.value).toBe(refresh);
      expect(a.expires).toBeUndefined();
      expect(a.maxAge).toBeUndefined();
      expect(r.expires).toBeUndefined();
      expect(r.maxAge).toBeUndefined();
      expect(a.httpOnly).toBeUndefined();
      expect(r.httpOnly).toBe(true);
      expect(a.sameSite?.toLowerCase()).toBe("lax");
      expect(r.sameSite?.toLowerCase()).toBe("lax");
      // legacy originals are not cleared by the migration
      expect(byName(writes(), LEGACY_ACCESS_KEY)).toEqual([]);
      expect(byName(writes(), LEGACY_REFRESH_KEY)).toEqual([]);
    });
  });

  describe("writes", () => {
    it("setSession writes namespaced access (JS-readable) and refresh (HttpOnly) with exp-based Expires", async () => {
      const access = makeAccess();
      const refresh = makeRefresh();
      const { client, writes } = h.create({});
      await client.setSession({ access, refresh });

      if (!h.persists) {
        expect(writes()).toEqual([]);
        return;
      }
      const a = last(writes(), ACCESS_KEY)!;
      const r = last(writes(), REFRESH_KEY)!;
      expect(a.value).toBe(access);
      expect(a.httpOnly).toBeUndefined();
      expect(a.path).toBe("/");
      expect(a.sameSite?.toLowerCase()).toBe("lax");
      expect(a.secure).toBeUndefined();
      expect(a.domain).toBeUndefined();
      expect(a.expires!.getTime()).toBe(expSec(access) * 1000);

      expect(r.value).toBe(refresh);
      expect(r.httpOnly).toBe(true);
      expect(r.path).toBe("/");
      expect(r.sameSite?.toLowerCase()).toBe("lax");
      expect(r.secure).toBeUndefined();
      expect(r.expires!.getTime()).toBe(expSec(refresh) * 1000);

      const names = writes().map((c) => c.name);
      expect(names).not.toContain(LEGACY_ACCESS_KEY);
      expect(names).not.toContain(LEGACY_REFRESH_KEY);
    });

    it("setSession without a refresh token writes only the access cookie", async () => {
      const { client, writes } = h.create({});
      await client.setSession({ access: makeAccess() });
      if (!h.persists) return;
      expect(byName(writes(), ACCESS_KEY)).toHaveLength(1);
      expect(byName(writes(), REFRESH_KEY)).toEqual([]);
    });

    it("setSession with an undecodable access token clears the session instead", async () => {
      const { client, writes } = h.create({ [ACCESS_KEY]: makeAccess() });
      const s = await client.setSession({ access: "not-a-jwt", refresh: makeRefresh() });
      expect(s.status).toBe("unauthenticated");
      if (!h.persists) return;
      expect(isDeletion(last(writes(), ACCESS_KEY))).toBe(true);
      expect(byName(writes(), REFRESH_KEY).every((c) => c.value === "")).toBe(true);
    });

    it("removeSession deletes namespaced AND legacy cookies (Max-Age=0, same Path/SameSite, refresh stays HttpOnly)", async () => {
      const { client, writes } = h.create({
        [ACCESS_KEY]: makeAccess(),
        [REFRESH_KEY]: makeRefresh(),
        [LEGACY_ACCESS_KEY]: makeAccess(),
        [LEGACY_REFRESH_KEY]: makeRefresh(),
      });
      await client.removeSession();
      if (!h.persists) {
        expect(writes()).toEqual([]);
        return;
      }
      for (const name of [ACCESS_KEY, LEGACY_ACCESS_KEY, REFRESH_KEY, LEGACY_REFRESH_KEY]) {
        const c = last(writes(), name)!;
        expect(isDeletion(c)).toBe(true);
        expect(c.maxAge).toBe(0);
        expect(c.path).toBe("/");
        expect(c.sameSite?.toLowerCase()).toBe("lax");
      }
      expect(last(writes(), REFRESH_KEY)!.httpOnly).toBe(true);
      expect(last(writes(), LEGACY_REFRESH_KEY)!.httpOnly).toBe(true);
      expect(last(writes(), ACCESS_KEY)!.httpOnly).toBeUndefined();
    });

    it("adds Secure to every write when NODE_ENV=production at client creation", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const { client, writes } = h.create({});
      await client.setSession({ access: makeAccess(), refresh: makeRefresh() });
      await client.removeSession();
      if (!h.persists) return;
      expect(writes().length).toBeGreaterThan(0);
      for (const c of writes()) expect(c.secure).toBe(true);
    });

    it("percent-encodes values so a token cannot smuggle attributes or headers", async () => {
      const { client, writes } = h.create({});
      const evil = `${makeAccess()}; Domain=evil.example\r\nSet-Cookie: pwn=1`;
      await client.scuteStorage.setItem(ACCESS_KEY, evil, { path: "/" });
      if (!h.persists) return;
      const all = writes();
      expect(all.map((c) => c.name)).toEqual([ACCESS_KEY]);
      expect(all[0].domain).toBeUndefined();
      expect(all[0].value).not.toContain(";");
      expect(all[0].value).not.toContain("\r");
      expect(decodeURIComponent(all[0].value)).toBe(evil);
    });
  });

  it("overrides a user-supplied sessionStorageAdapter with its own adapter", async () => {
    const mine = { getItem: vi.fn(async () => null), setItem: vi.fn(), removeItem: vi.fn() };
    const { client } = h.create({}, { preferences: { sessionStorageAdapter: mine } });
    expect(client.scuteStorage).not.toBe(mine);
    expect(client.scuteStorage.constructor.name).toMatch(/^ScuteNext/);
    await client.initialSessionState();
    expect(mine.getItem).not.toHaveBeenCalled();
  });
});
