import { createServerComponentClient } from "../serverComponentClient";
import {
  ACCESS_KEY,
  APP_ID,
  LEGACY_ACCESS_KEY,
  REFRESH_KEY,
  clientConfig,
  createUpstream,
  json,
  makeAccess,
  makeRefresh,
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
});

const create = (cookies: Record<string, string>, extra: Record<string, unknown> = {}, asyncCookies = false) => {
  const sealed = makeSealedCookies(cookies);
  return createServerComponentClient(
    { cookies: asyncCookies ? async () => sealed as any : () => sealed as any },
    clientConfig(extra)
  ) as any;
};

describe("createServerComponentClient storage", () => {
  it("reads cookies (sync and async cookies())", async () => {
    expect(await create({ a: "1" }).scuteStorage.getItem("a")).toBe("1");
    expect(await create({ a: "1" }, {}, true).scuteStorage.getItem("a")).toBe("1");
    expect(await create({}).scuteStorage.getItem("a")).toBeNull();
  });

  it("setItem/removeItem are silent no-ops on Next's read-only cookie store", async () => {
    const client = create({ a: "1" });
    await expect(client.scuteStorage.setItem("a", "2")).resolves.toBeUndefined();
    await expect(client.scuteStorage.removeItem("a")).resolves.toBeUndefined();
    expect(await client.scuteStorage.getItem("a")).toBe("1");
  });

  it("setSession / removeSession do not throw and change nothing", async () => {
    const access = makeAccess();
    const client = create({ [ACCESS_KEY]: access });
    await client.setSession({ access: makeAccess({ tag: "new" }), refresh: makeRefresh() });
    await client.removeSession();
    expect((await client.initialSessionState()).access).toBe(access);
  });

  it("legacy fallback still reads (migration write is a no-op)", async () => {
    const legacy = makeAccess();
    const client = create({ [LEGACY_ACCESS_KEY]: legacy });
    expect((await client.initialSessionState()).access).toBe(legacy);
    expect(await client.scuteStorage.getItem(ACCESS_KEY)).toBeNull();
  });
});

describe("createServerComponentClient refresh policy", () => {
  it("forces autoRefreshToken: false even when config asks for true", () => {
    const client = create({}, { preferences: { autoRefreshToken: true } });
    expect(client.config.autoRefreshToken).toBe(false);
  });

  it("getSession() with a valid access token loads the user, no token calls", async () => {
    const access = makeAccess();
    const { data, error } = await create({ [ACCESS_KEY]: access }).getSession();
    expect(error).toBeNull();
    expect(data.user?.id).toBe("user-1");
    expect(data.session?.access).toBe(access);
    expect(upstream.callsTo("/tokens/")).toEqual([]);
  });

  // CURRENT BEHAVIOR: server components never refresh. With an expired
  // access token and a valid refresh token the session is reported as
  // expired for this render (the middleware / client must refresh).
  it("getSession() with an expired access token does not refresh and ends unauthenticated", async () => {
    upstream.on("GET", `/v1/auth/${APP_ID}/current_user`, () => json({ error: "expired" }, 401));
    const expired = makeAccess({ expIn: -60 });
    const { data, error } = await create({ [ACCESS_KEY]: expired, [REFRESH_KEY]: makeRefresh() }).getSession();
    expect(upstream.callsTo("/tokens/")).toEqual([]);
    expect(upstream.callsTo("/current_user", "GET")[0].headers.get("x-authorization")).toBe(expired);
    expect(error).not.toBeNull();
    expect(data.session.status).toBe("unauthenticated");
    expect(data.user).toBeNull();
  });

  it("getSession() with only a refresh cookie makes no upstream token call", async () => {
    const { data, error } = await create({ [REFRESH_KEY]: makeRefresh() }).getSession();
    expect(upstream.callsTo("/tokens/")).toEqual([]);
    expect(upstream.callsTo("/current_user")).toEqual([]);
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });
});
