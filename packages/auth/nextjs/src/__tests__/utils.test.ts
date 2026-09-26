import { getBody, getInitUrl, randomBytes } from "../utils";

const req = (init: RequestInit & { url?: string } = {}) =>
  new Request(init.url ?? "http://localhost/auth/x", init);

describe("getBody", () => {
  it("returns undefined for GET", async () => {
    expect(await getBody(req({ method: "GET" }))).toBeUndefined();
  });

  it("returns undefined for a POST without a body", async () => {
    expect(await getBody(req({ method: "POST" }))).toBeUndefined();
  });

  it("parses a JSON POST body", async () => {
    const r = req({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1, nested: { b: "c" } }),
    });
    expect(await getBody(r)).toEqual({ a: 1, nested: { b: "c" } });
  });

  it("accepts JSON content types with parameters", async () => {
    const r = req({
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: '{"x":true}',
    });
    expect(await getBody(r)).toEqual({ x: true });
  });

  it("returns {} for malformed JSON instead of throwing", async () => {
    const r = req({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(await getBody(r)).toEqual({});
  });

  it("parses urlencoded form bodies into a flat object (last duplicate wins)", async () => {
    const r = req({
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "a=1&b=two+words&a=3",
    });
    expect(await getBody(r)).toEqual({ a: "3", b: "two words" });
  });

  it("returns undefined for other content types (text/plain, multipart, missing)", async () => {
    expect(
      await getBody(
        req({ method: "POST", headers: { "content-type": "text/plain" }, body: "x" })
      )
    ).toBeUndefined();
    expect(
      await getBody(new Request("http://localhost/", { method: "POST", body: new Uint8Array([1]) }))
    ).toBeUndefined();
  });

  it("only reads bodies for POST (PUT with JSON is ignored)", async () => {
    const r = req({
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: '{"a":1}',
    });
    expect(await getBody(r)).toBeUndefined();
  });

  it("returns undefined for objects without a body property", async () => {
    expect(await getBody({ method: "POST", headers: new Headers() } as any)).toBeUndefined();
  });
});

describe("getInitUrl", () => {
  it("prefers the Next internal request meta __NEXT_INIT_URL when present", () => {
    const r: any = {
      url: "/ignored",
      headers: { host: "attacker.example" },
      [Symbol("NextInternalRequestMeta")]: {
        __NEXT_INIT_URL: "https://app.example/api/auth/csrf?x=1",
      },
    };
    const url = getInitUrl(r);
    expect(url.href).toBe("https://app.example/api/auth/csrf?x=1");
  });

  it("matches the meta symbol by description, not identity", () => {
    const r: any = {
      url: "/x",
      headers: {},
      [Symbol("NextInternalRequestMeta")]: { __NEXT_INIT_URL: "http://a.b/c" },
    };
    expect(getInitUrl(r).pathname).toBe("/c");
  });

  it("falls back to http://<host><url> when no meta symbol exists", () => {
    const url = getInitUrl({ url: "/api/auth/refresh", headers: { host: "app.local:3000" } } as any);
    expect(url.href).toBe("http://app.local:3000/api/auth/refresh");
  });

  it("uses https when x-forwarded-proto is https", () => {
    const url = getInitUrl({
      url: "/a",
      headers: { host: "app.local", "x-forwarded-proto": "https" },
    } as any);
    expect(url.protocol).toBe("https:");
  });

  it("uses https when the socket is TLS", () => {
    const url = getInitUrl({
      url: "/a",
      headers: { host: "app.local" },
      socket: { encrypted: true },
    } as any);
    expect(url.protocol).toBe("https:");
  });

  // CURRENT BEHAVIOR: the fallback trusts the Host header for the origin.
  // Only `pathname` is consumed downstream (route matching), so this is not
  // exploitable today, but any future use of the origin would be.
  it("builds the origin from the (client-controlled) Host header in the fallback", () => {
    const url = getInitUrl({ url: "/api/auth/csrf", headers: { host: "evil.example" } } as any);
    expect(url.origin).toBe("http://evil.example");
    expect(url.pathname).toBe("/api/auth/csrf");
  });

  it("keeps percent-encoding in the path (no decoding)", () => {
    const url = getInitUrl({ url: "/api/auth/%63srf", headers: { host: "h" } } as any);
    expect(url.pathname).toBe("/api/auth/%63srf");
  });

  // CURRENT BEHAVIOR (suspected bug, low): when the meta symbol exists but
  // has no __NEXT_INIT_URL, `new URL(undefined)` throws outside the
  // try/catch instead of using the Host fallback.
  it("throws when the meta symbol exists without __NEXT_INIT_URL", () => {
    const r: any = {
      url: "/a",
      headers: { host: "h" },
      [Symbol("NextInternalRequestMeta")]: {},
    };
    expect(() => getInitUrl(r)).toThrow(TypeError);
  });
});

describe("randomBytes", () => {
  it("returns a Buffer of the requested length", () => {
    const b = randomBytes(64);
    expect(Buffer.isBuffer(b)).toBe(true);
    expect(b.length).toBe(64);
  });

  it("returns different bytes each call", () => {
    expect(randomBytes(32).equals(randomBytes(32))).toBe(false);
  });

  it("supports zero length", () => {
    expect(randomBytes(0).length).toBe(0);
  });
});
