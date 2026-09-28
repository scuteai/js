import { decodeJwtPayload, getBody, getInitUrl, randomBytes } from "../utils";

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

  it("reads the Next 14+ `initURL` meta key", () => {
    const r: any = {
      url: "/ignored",
      headers: { host: "other.example" },
      [Symbol.for("NextInternalRequestMeta")]: { initURL: "https://app.example/api/auth/refresh" },
    };
    expect(getInitUrl(r).href).toBe("https://app.example/api/auth/refresh");
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

  // By design: the fallback builds the origin from the Host header. Only
  // `pathname` is used downstream (route matching); don't start relying on
  // the origin from this URL.
  it("builds the origin from the Host header in the fallback", () => {
    const url = getInitUrl({ url: "/api/auth/csrf", headers: { host: "evil.example" } } as any);
    expect(url.origin).toBe("http://evil.example");
    expect(url.pathname).toBe("/api/auth/csrf");
  });

  it("keeps percent-encoding in the path (no decoding)", () => {
    const url = getInitUrl({ url: "/api/auth/%63srf", headers: { host: "h" } } as any);
    expect(url.pathname).toBe("/api/auth/%63srf");
  });

  it("falls back to the Host header when the meta symbol exists without an init URL", () => {
    for (const meta of [{}, { __NEXT_INIT_URL: "" }, { initURL: "not a url" }, null]) {
      const r: any = {
        url: "/a",
        headers: { host: "h" },
        [Symbol("NextInternalRequestMeta")]: meta,
      };
      expect(getInitUrl(r).href).toBe("http://h/a");
    }
  });
});

describe("decodeJwtPayload", () => {
  const seg = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");

  it("decodes the payload of a compact JWT (including UTF-8)", () => {
    expect(decodeJwtPayload(`${seg({ alg: "none" })}.${seg({ uuid: "u", exp: 1, name: "J\u00f6rg" })}.sig`)).toEqual({
      uuid: "u",
      exp: 1,
      name: "J\u00f6rg",
    });
  });

  it("returns null for anything that is not three base64url segments with a JSON object payload", () => {
    for (const token of [
      "",
      "not-a-jwt",
      "a.b",
      "a.b.c.d",
      `${seg({})}.${seg({ a: 1 })}.`,
      `${seg({})}.${seg({ a: 1 })}.sig; Domain=x`,
      `${seg({})}.${seg([1, 2])}.sig`,
      `${seg({})}.${seg("str")}.sig`,
      `${seg({})}.${Buffer.from("{not json").toString("base64url")}.sig`,
      `${seg({})}.a.sig`,
    ]) {
      expect(decodeJwtPayload(token)).toBeNull();
    }
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
