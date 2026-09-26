import { IncomingMessage, ServerResponse } from "http";
import { Socket } from "net";
import { createPagesServerClient } from "../pagesServerClient";
import {
  ACCESS_KEY,
  REFRESH_KEY,
  clientConfig,
  createUpstream,
  lastCookie,
  makeAccess,
  makeRefresh,
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

const setCookiesOf = (res: ServerResponse) => {
  const v = res.getHeader("set-cookie");
  return v === undefined ? [] : Array.isArray(v) ? v.map(String) : [String(v)];
};

const create = (cookies: Record<string, string> = {}, gssp = false) => {
  const res = new ServerResponse(new IncomingMessage(new Socket()));
  const req: any = { cookies, headers: {} };
  const context: any = gssp ? { req, res, query: {}, resolvedUrl: "/", params: {} } : { req, res };
  const client: any = createPagesServerClient(context, clientConfig());
  return { req, res, client, storage: client.scuteStorage };
};

describe("createPagesServerClient storage", () => {
  it("reads from req.cookies and returns null when missing", async () => {
    const { storage } = create({ a: "1" });
    expect(await storage.getItem("a")).toBe("1");
    expect(await storage.getItem("missing")).toBeNull();
  });

  it("prefers a non-empty value already in the response Set-Cookie", async () => {
    const { storage, res } = create({ a: "old" });
    res.setHeader("set-cookie", "a=new; Path=/");
    expect(await storage.getItem("a")).toBe("new");
  });

  it("setItem serializes with cookie@0.5 and default Path=/", async () => {
    const { storage, res } = create();
    await storage.setItem("k", "v", { httpOnly: true, sameSite: "lax" });
    expect(setCookiesOf(res)).toEqual(["k=v; Path=/; HttpOnly; SameSite=Lax"]);
  });

  it("setItem replaces an earlier Set-Cookie for the same name and keeps unrelated ones", async () => {
    const { storage, res } = create();
    res.setHeader("set-cookie", ["app=1; Path=/", "k=old; Path=/"]);
    await storage.setItem("k", "new");
    expect(setCookiesOf(res)).toEqual(["app=1; Path=/", "k=new; Path=/"]);
    expect(await storage.getItem("k")).toBe("new");
  });

  it("handles a single pre-existing Set-Cookie given as a string", async () => {
    const { storage, res } = create();
    res.setHeader("set-cookie", "app=1; Path=/");
    await storage.setItem("k", "v");
    expect(setCookiesOf(res)).toEqual(["app=1; Path=/", "k=v; Path=/"]);
  });

  it("keeps Expires dates (which contain commas) intact when re-splitting headers", async () => {
    const { storage, res } = create();
    const expires = new Date("2030-01-02T03:04:05Z");
    await storage.setItem("a", "1", { expires });
    await storage.setItem("b", "2");
    expect(setCookiesOf(res)).toEqual([
      "a=1; Path=/; Expires=Wed, 02 Jan 2030 03:04:05 GMT",
      "b=2; Path=/",
    ]);
  });

  // Known limitation, tracked separately: after a deletion, reads fall back
  // to req.cookies for the rest of the request (see the Pages Node handler
  // refresh-failure test).
  it("a deleted cookie is still read back from req.cookies", async () => {
    const { storage, res } = create({ k: "stale" });
    await storage.removeItem("k");
    expect(setCookiesOf(res)).toEqual(["k=; Max-Age=0; Path=/"]);
    expect(await storage.getItem("k")).toBe("stale");
  });

  it("removeSession leaves exactly one deletion per cookie name", async () => {
    const { client, res } = create({ [ACCESS_KEY]: makeAccess(), [REFRESH_KEY]: makeRefresh() });
    await client.removeSession();
    await client.removeSession();
    const names = setCookiesOf(res).map((c) => c.split("=")[0]);
    expect(names.sort()).toEqual(
      [ACCESS_KEY, REFRESH_KEY, "sc-access-token", "sc-refresh-token"].sort()
    );
  });
});

describe("createPagesServerClient in getServerSideProps", () => {
  it("accepts a GetServerSidePropsContext and refreshes an expired session onto res", async () => {
    const refresh = makeRefresh({ tag: "gssp" });
    const { client, res } = create({ [ACCESS_KEY]: makeAccess({ expIn: -60 }), [REFRESH_KEY]: refresh }, true);
    const { data, error } = await client.getSession();
    expect(error).toBeNull();
    expect(data.user?.id).toBe("user-1");
    expect(upstream.callsTo("/tokens/refresh")[0].headers.get("x-refresh-token")).toBe(refresh);
    const sc = setCookiesOf(res);
    expect(lastCookie(sc, REFRESH_KEY)!.value).toBe(upstream.issued.refreshedRefresh);
    expect(lastCookie(sc, REFRESH_KEY)!.httpOnly).toBe(true);
    expect(sc.filter((c) => c.startsWith(`${REFRESH_KEY}=`))).toHaveLength(1);
    // no response `cookie` mirror header on this adapter
    expect(res.getHeader("cookie")).toBeUndefined();
  });
});
