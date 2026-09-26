import { createPagesEdgeRuntimeClient } from "../pagesEdgeRuntimeClient";
import {
  ACCESS_KEY,
  REFRESH_KEY,
  clientConfig,
  createUpstream,
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

describe("createPagesEdgeRuntimeClient storage", () => {
  it("reads from request.cookies and returns null when missing", async () => {
    const { storage } = create({ a: "1" });
    expect(await storage.getItem("a")).toBe("1");
    expect(await storage.getItem("missing")).toBeNull();
  });

  // CURRENT BEHAVIOR (suspected bug): writes go to the REQUEST cookie jar
  // via RequestCookies.set(name, value, options). RequestCookies ignores
  // the options argument, so HttpOnly/Secure/SameSite/Expires are dropped,
  // and nothing ever reaches a response.
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
