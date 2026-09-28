import { createPagesEdgeRuntimeClient } from "../pagesEdgeRuntimeClient";
import {
  ACCESS_KEY,
  REFRESH_KEY,
  clientConfig,
  createUpstream,
  lastCookie,
  makeAccess,
  makeNextRequest,
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

const create = (cookies: Record<string, string> = {}) => {
  const request = makeNextRequest("/api/x", { cookies });
  const client: any = createPagesEdgeRuntimeClient({ request }, clientConfig());
  return { request, client, storage: client.scuteStorage };
};

describe("createPagesEdgeRuntimeClient storage without a response", () => {
  it("reads from request.cookies and returns null when missing", async () => {
    const { storage } = create({ a: "1" });
    expect(await storage.getItem("a")).toBe("1");
    expect(await storage.getItem("missing")).toBeNull();
  });

  // Known limitation, tracked separately: with no `response` in the
  // context, writes only update the request cookie jar (attributes are
  // dropped) and never reach the browser. Pass `response` to fix that.
  it("setItem mutates the request Cookie header and drops all attributes", async () => {
    const { storage, request } = create({ a: "1" });
    await storage.setItem("k", "v", { httpOnly: true, secure: true, sameSite: "strict" });
    expect(request.headers.get("cookie")).toBe("a=1; k=v");
    expect(request.cookies.get("k")).toEqual({ name: "k", value: "v" });
  });

  it("removeItem leaves the cookie on the request with an empty value", async () => {
    const { storage, request } = create({ k: "v" });
    await storage.removeItem("k");
    expect(request.cookies.get("k")?.value).toBe("");
    expect(request.headers.get("cookie")).toBe("k=");
  });

  it("getSession() refresh keeps the rotated tokens only on the request object", async () => {
    const { client, request } = create({ [ACCESS_KEY]: makeAccess({ expIn: -60 }), [REFRESH_KEY]: makeRefresh() });
    const { data, error } = await client.getSession();
    expect(error).toBeNull();
    expect(data.session.access).toBe(upstream.issued.refreshedAccess);
    expect(request.cookies.get(REFRESH_KEY)?.value).toBe(upstream.issued.refreshedRefresh);
  });
});

describe("createPagesEdgeRuntimeClient storage with a response", () => {
  const createWithResponse = (cookies: Record<string, string> = {}) => {
    const request = makeNextRequest("/api/x", { cookies });
    const response = new Response(null);
    const client: any = createPagesEdgeRuntimeClient({ request, response }, clientConfig());
    return { request, response, client, storage: client.scuteStorage };
  };

  it("setItem writes a Set-Cookie with its attributes to the response, not to the request", async () => {
    const { storage, request, response } = createWithResponse({ a: "1" });
    await storage.setItem("k", "v", { httpOnly: true, secure: true, sameSite: "strict" });
    expect(response.headers.getSetCookie()).toEqual(["k=v; Path=/; HttpOnly; Secure; SameSite=Strict"]);
    expect(request.headers.get("cookie")).toBe("a=1");
  });

  it("replaces an earlier Set-Cookie for the same name and keeps unrelated ones", async () => {
    const { storage, response } = createWithResponse();
    response.headers.append("set-cookie", "other=1; Path=/");
    await storage.setItem("k", "v1");
    await storage.setItem("k", "v2");
    expect(response.headers.getSetCookie()).toEqual(["other=1; Path=/", "k=v2; Path=/"]);
  });

  it("reads its own writes and deletions before falling back to the request", async () => {
    const { storage } = createWithResponse({ k: "from-request", gone: "stale" });
    expect(await storage.getItem("k")).toBe("from-request");
    await storage.setItem("k", "written");
    expect(await storage.getItem("k")).toBe("written");
    await storage.removeItem("gone");
    expect(await storage.getItem("gone")).toBeNull();
  });

  it("removeItem writes a Max-Age=0 deletion to the response", async () => {
    const { storage, response } = createWithResponse({ k: "v" });
    await storage.removeItem("k");
    expect(response.headers.getSetCookie()).toEqual(["k=; Max-Age=0; Path=/"]);
  });

  it("getSession() refresh puts the rotated tokens on the response (refresh HttpOnly)", async () => {
    const { client, response } = createWithResponse({ [ACCESS_KEY]: makeAccess({ expIn: -60 }), [REFRESH_KEY]: makeRefresh() });
    const { data, error } = await client.getSession();
    expect(error).toBeNull();
    expect(data.session.access).toBe(upstream.issued.refreshedAccess);
    const refresh = lastCookie(response.headers.getSetCookie(), REFRESH_KEY)!;
    expect(refresh.value).toBe(upstream.issued.refreshedRefresh);
    expect(refresh.httpOnly).toBe(true);
    expect(lastCookie(response.headers.getSetCookie(), ACCESS_KEY)!.value).toBe(upstream.issued.refreshedAccess);
  });
});
