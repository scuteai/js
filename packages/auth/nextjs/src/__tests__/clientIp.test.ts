import { NextResponse } from "next/server";
import { createMiddlewareClient } from "../middlewareClient";
import { createPagesEdgeRuntimeClient } from "../pagesEdgeRuntimeClient";
import { createPagesServerClient } from "../pagesServerClient";
import { createRouteHandlerClient } from "../routeHandlerClient";
import {
  APP_ID,
  clientConfig,
  createUpstream,
  makeNextRequest,
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

const USERS = `/v1/auth/${APP_ID}/users`;

/** The X-Scute-Client-IP a server client sends with the secret key. */
const sentIp = async (client: any) => {
  upstream.on("POST", USERS, () => new Response(JSON.stringify({ user: { id: "user-1" } }), { status: 200, headers: { "content-type": "application/json" } }));
  await client.admin.createUser("u@example.com");
  const call = upstream.callsTo(USERS, "POST").at(-1)!;
  expect(call.headers.get("authorization")).toMatch(/^Bearer /);
  return call.headers.get("x-scute-client-ip");
};

const pagesContext = (remoteAddress?: string) => {
  const req: any = { cookies: {}, headers: { "x-forwarded-for": "198.51.100.99" }, socket: { remoteAddress } };
  return { req, res: { getHeader: () => undefined, setHeader: () => {} } as any };
};

describe("the person's address on server calls", () => {
  it("pages server client: the address that connected, never X-Forwarded-For", async () => {
    expect(await sentIp(createPagesServerClient(pagesContext("::ffff:203.0.113.24"), clientConfig()))).toBe("::ffff:203.0.113.24");
  });

  it("pages server client: no socket address, none sent", async () => {
    expect(await sentIp(createPagesServerClient(pagesContext(undefined), clientConfig()))).toBeNull();
  });

  it("an explicit clientIp wins over the detected one, and null sends none", async () => {
    expect(await sentIp(createPagesServerClient(pagesContext("10.0.0.5"), clientConfig({ clientIp: "203.0.113.24" })))).toBe("203.0.113.24");
    expect(await sentIp(createPagesServerClient(pagesContext("10.0.0.5"), clientConfig({ clientIp: null })))).toBeNull();
  });

  it("middleware: request.ip where Next.js provides it", async () => {
    const req = makeNextRequest("/", { headers: { "x-forwarded-for": "198.51.100.99" } });
    Object.defineProperty(req, "ip", { value: "2001:db8::1" });
    expect(await sentIp(createMiddlewareClient({ req, res: NextResponse.next() }, clientConfig()))).toBe("2001:db8::1");
  });

  it("middleware: without request.ip, none (proxy headers are not read)", async () => {
    const req = makeNextRequest("/", { headers: { "x-forwarded-for": "198.51.100.99", "x-real-ip": "198.51.100.98" } });
    expect(await sentIp(createMiddlewareClient({ req, res: NextResponse.next() }, clientConfig()))).toBeNull();
  });

  it("pages edge runtime: request.ip, or the clientIp passed", async () => {
    const request = makeNextRequest("/");
    Object.defineProperty(request, "ip", { value: "203.0.113.24" });
    expect(await sentIp(createPagesEdgeRuntimeClient({ request }, clientConfig()))).toBe("203.0.113.24");
    expect(await sentIp(createPagesEdgeRuntimeClient({ request: makeNextRequest("/") }, clientConfig({ clientIp: "198.51.100.7" })))).toBe("198.51.100.7");
  });

  it("route handler: the clientIp passed", async () => {
    const cookies = () => ({ get: () => undefined, set: () => {} }) as any;
    expect(await sentIp(createRouteHandlerClient({ cookies }, clientConfig({ clientIp: "203.0.113.24" })))).toBe("203.0.113.24");
    expect(await sentIp(createRouteHandlerClient({ cookies }, clientConfig()))).toBeNull();
  });

  it("a request address that isn't one address is skipped, not sent", async () => {
    const req = makeNextRequest("/");
    Object.defineProperty(req, "ip", { value: "203.0.113.24, 10.0.0.1" });
    expect(await sentIp(createMiddlewareClient({ req, res: NextResponse.next() }, clientConfig()))).toBeNull();
  });
});
