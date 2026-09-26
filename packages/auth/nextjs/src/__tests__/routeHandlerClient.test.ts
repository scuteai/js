import { createRouteHandlerClient } from "../routeHandlerClient";
import { createServerActionClient } from "../serverActionClient";
import {
  ACCESS_KEY,
  APP_ID,
  LEGACY_ACCESS_KEY,
  REFRESH_KEY,
  clientConfig,
  createUpstream,
  lastCookie,
  makeAccess,
  makeRefresh,
  makeRouteContext,
  makeSealedCookies,
  settle,
  type Upstream,
} from "./_support";

let upstream: Upstream;

beforeEach(() => {
  upstream = createUpstream().install();
});

afterEach(async () => {
  await settle();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("createServerActionClient", () => {
  it("is literally createRouteHandlerClient", () => {
    expect(createServerActionClient).toBe(createRouteHandlerClient);
  });
});

describe("createRouteHandlerClient storage", () => {
  const storageOf = (ctx: ReturnType<typeof makeRouteContext>) =>
    (createRouteHandlerClient({ cookies: ctx.context.cookies }, clientConfig()) as any).scuteStorage;

  it("reads through cookies().get and returns null for missing cookies", async () => {
    const ctx = makeRouteContext({ a: "1" });
    const s = storageOf(ctx);
    expect(await s.getItem("a")).toBe("1");
    expect(await s.getItem("missing")).toBeNull();
  });

  it("writes through cookies().set with default Path=/ merged in", async () => {
    const ctx = makeRouteContext();
    const s = storageOf(ctx);
    await s.setItem("k", "v", { sameSite: "strict" });
    expect(ctx.setCookies()).toEqual(["k=v; Path=/; SameSite=strict"]);
    expect(ctx.store.get("k")?.value).toBe("v");
  });

  it("deletes by setting an empty value with Max-Age=0 (keeping the other attributes)", async () => {
    const ctx = makeRouteContext({ k: "v" });
    const s = storageOf(ctx);
    await s.removeItem("k", { httpOnly: true, sameSite: "lax" });
    expect(ctx.setCookies()).toEqual(["k=; Path=/; Max-Age=0; HttpOnly; SameSite=lax"]);
  });

  it("after a delete, the same request reads an empty value (no resurrection from the request)", async () => {
    const access = makeAccess();
    const ctx = makeRouteContext({ [ACCESS_KEY]: access });
    const client: any = createRouteHandlerClient({ cookies: ctx.context.cookies }, clientConfig());
    await client.removeSession();
    expect(await client.scuteStorage.getItem(ACCESS_KEY)).toBe("");
    expect((await client.initialSessionState()).status).toBe("unauthenticated");
  });

  it("works with async cookies() (Next 15+)", async () => {
    const ctx = makeRouteContext({ a: "1" }, {}, { asyncCookies: true });
    const s = storageOf(ctx);
    expect(await s.getItem("a")).toBe("1");
    await s.setItem("b", "2");
    expect(ctx.setCookies()).toEqual(["b=2; Path=/"]);
  });

  it("with a read-only (server component) cookies store: reads work, legacy migration errors are swallowed", async () => {
    const legacy = makeAccess();
    const sealed = makeSealedCookies({ [LEGACY_ACCESS_KEY]: legacy });
    const client: any = createRouteHandlerClient({ cookies: () => sealed as any }, clientConfig());
    const s = await client.initialSessionState();
    expect(s.access).toBe(legacy);
  });

  // CURRENT BEHAVIOR: using the route handler client where cookies are
  // read-only throws Next's ReadonlyRequestCookiesError on the first write.
  it("with a read-only cookies store: setSession throws Next's read-only error", async () => {
    const client: any = createRouteHandlerClient({ cookies: () => makeSealedCookies() as any }, clientConfig());
    await expect(client.setSession({ access: makeAccess() })).rejects.toThrow(
      /Cookies can only be modified in a Server Action or Route Handler/
    );
  });
});

describe("createRouteHandlerClient session flows", () => {
  it("getSession() with an expired access cookie refreshes via the refresh cookie and persists new tokens", async () => {
    const refresh = makeRefresh({ tag: "rh" });
    const ctx = makeRouteContext({ [ACCESS_KEY]: makeAccess({ expIn: -60 }), [REFRESH_KEY]: refresh });
    const client = createRouteHandlerClient({ cookies: ctx.context.cookies }, clientConfig());
    const { data, error } = await client.getSession();
    expect(error).toBeNull();
    expect(data.user?.id).toBe("user-1");
    expect(data.session?.access).toBe(upstream.issued.refreshedAccess);
    expect(upstream.callsTo("/tokens/refresh")[0].headers.get("x-refresh-token")).toBe(refresh);
    expect(lastCookie(ctx.setCookies(), ACCESS_KEY)!.value).toBe(upstream.issued.refreshedAccess);
    expect(lastCookie(ctx.setCookies(), REFRESH_KEY)!.value).toBe(upstream.issued.refreshedRefresh);
    expect(lastCookie(ctx.setCookies(), REFRESH_KEY)!.httpOnly).toBe(true);
  });

  it("getSession() with a valid access cookie makes no refresh call", async () => {
    const access = makeAccess();
    const ctx = makeRouteContext({ [ACCESS_KEY]: access });
    const client = createRouteHandlerClient({ cookies: ctx.context.cookies }, clientConfig());
    const { data } = await client.getSession();
    expect(data.session?.access).toBe(access);
    expect(upstream.callsTo("/tokens/")).toEqual([]);
    expect(upstream.callsTo("/current_user", "GET")[0].headers.get("x-authorization")).toBe(access);
    expect(ctx.setCookies()).toEqual([]);
  });

  it("the app id in every upstream path comes from config", async () => {
    const ctx = makeRouteContext({ [REFRESH_KEY]: makeRefresh() });
    const client = createRouteHandlerClient({ cookies: ctx.context.cookies }, clientConfig());
    await client.refreshSession();
    for (const c of upstream.calls) expect(c.path).toContain(APP_ID);
  });
});
