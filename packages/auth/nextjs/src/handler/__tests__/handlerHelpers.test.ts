import { fetchWithCsrf, getHandlerPath } from "../handlerHelpers";

describe("getHandlerPath", () => {
  it("builds /auth/<handler> without a prefix", () => {
    expect(getHandlerPath("csrf")).toBe("/auth/csrf");
    expect(getHandlerPath("sign-in")).toBe("/auth/sign-in");
  });

  it("treats an empty prefix like no prefix", () => {
    expect(getHandlerPath("refresh", "")).toBe("/auth/refresh");
    expect(getHandlerPath("refresh", "/")).toBe("/auth/refresh");
    expect(getHandlerPath("refresh", "///")).toBe("/auth/refresh");
  });

  it("normalizes leading, trailing and repeated slashes in the prefix", () => {
    expect(getHandlerPath("csrf", "api")).toBe("/api/auth/csrf");
    expect(getHandlerPath("csrf", "/api")).toBe("/api/auth/csrf");
    expect(getHandlerPath("csrf", "/api/")).toBe("/api/auth/csrf");
    expect(getHandlerPath("csrf", "a//b/")).toBe("/a/b/auth/csrf");
  });

  it("never produces an absolute or protocol-relative URL, even from a URL-looking prefix", () => {
    expect(getHandlerPath("csrf", "https://evil.example")).toBe(
      "/https:/evil.example/auth/csrf"
    );
    expect(getHandlerPath("csrf", "//evil.example")).toBe(
      "/evil.example/auth/csrf"
    );
    for (const p of ["https://evil.example", "//evil.example", "///x"]) {
      const out = getHandlerPath("csrf", p);
      expect(out.startsWith("//")).toBe(false);
      expect(new URL(out, "http://app.local").origin).toBe("http://app.local");
    }
  });

  it("does not resolve dot segments or encode the prefix", () => {
    expect(getHandlerPath("csrf", "../x")).toBe("/../x/auth/csrf");
    expect(getHandlerPath("csrf", "a b")).toBe("/a b/auth/csrf");
  });
});

describe("fetchWithCsrf", () => {
  let calls: { url: string; init: RequestInit | undefined }[];

  const install = (
    csrf: () => Promise<Response> = async () => new Response("tok-1")
  ) => {
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.endsWith("/auth/csrf")) return csrf();
        return new Response("ok", { status: 200 });
      })
    );
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** headers of the n-th fetch, as a lowercase-keyed object */
  const sentHeaders = (n: number) =>
    Object.fromEntries(new Headers(calls[n].init?.headers as HeadersInit));

  it("GETs the csrf handler first, then calls the target handler with the token header", async () => {
    install();
    const res = await fetchWithCsrf("sign-out", { method: "POST" });

    expect(res.status).toBe(200);
    expect(calls.map((c) => c.url)).toEqual(["/auth/csrf", "/auth/sign-out"]);
    // the token request is a bare GET (no init)
    expect(calls[0].init).toBeUndefined();
    expect(calls[1].init?.method).toBe("POST");
    expect(sentHeaders(1)).toEqual({
      "content-type": "application/json",
      "x-csrf-token": "tok-1",
    });
  });

  it("applies the prefix to both requests", async () => {
    install();
    await fetchWithCsrf("refresh", { method: "POST" }, "/api/");
    expect(calls.map((c) => c.url)).toEqual([
      "/api/auth/csrf",
      "/api/auth/refresh",
    ]);
  });

  it("keeps caller headers given as a plain object", async () => {
    install();
    await fetchWithCsrf("sign-in", {
      method: "POST",
      headers: { Authorization: "Bearer abc" },
    });
    expect(sentHeaders(1)).toEqual({
      authorization: "Bearer abc",
      "content-type": "application/json",
      "x-csrf-token": "tok-1",
    });
  });

  it("overrides a caller-supplied Content-Type and X-CSRF-Token, whatever their casing", async () => {
    install();
    await fetchWithCsrf("sign-in", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-csrf-token": "forged" },
    });
    expect(sentHeaders(1)).toEqual({
      "content-type": "application/json",
      "x-csrf-token": "tok-1",
    });
  });

  it("keeps caller headers passed as a Headers instance or as tuples", async () => {
    install();
    await fetchWithCsrf("sign-in", {
      method: "POST",
      headers: new Headers({ Authorization: "Bearer abc" }),
    });
    await fetchWithCsrf("sign-in", {
      method: "POST",
      headers: [["Authorization", "Bearer def"]],
    });
    expect(sentHeaders(1)).toEqual({
      authorization: "Bearer abc",
      "content-type": "application/json",
      "x-csrf-token": "tok-1",
    });
    expect(sentHeaders(3).authorization).toBe("Bearer def");
    expect(sentHeaders(3)["x-csrf-token"]).toBe("tok-1");
  });

  it("rejects with a clear error, and sends nothing, when the csrf fetch rejects", async () => {
    install(async () => {
      throw new Error("offline");
    });
    await expect(fetchWithCsrf("sign-out", { method: "POST" })).rejects.toThrow(
      "[Scute] Could not fetch a CSRF token from /auth/csrf"
    );
    expect(calls.map((c) => c.url)).toEqual(["/auth/csrf"]);
  });

  it("returns a non-ok response, and sends nothing, when the csrf endpoint answers with an error", async () => {
    install(async () => new Response("Bad Request", { status: 400 }));
    const res = await fetchWithCsrf("refresh", { method: "POST" }, "api");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.statusText).toBe("CSRF token unavailable");
    expect(await res.text()).toBe("[Scute] Could not get a CSRF token from /api/auth/csrf (status 400)");
    expect(calls.map((c) => c.url)).toEqual(["/api/auth/csrf"]);
  });

  it("returns a non-ok response, and sends nothing, when the csrf token is empty", async () => {
    install(async () => new Response(""));
    const res = await fetchWithCsrf("sign-in", { method: "POST" });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
    expect(calls.map((c) => c.url)).toEqual(["/auth/csrf"]);
  });

  it("uses relative URLs only (never leaves the current origin)", async () => {
    install();
    await fetchWithCsrf("refresh", { method: "POST" }, "https://evil.example");
    for (const c of calls) {
      expect(c.url.startsWith("/")).toBe(true);
      expect(c.url.startsWith("//")).toBe(false);
    }
  });

  it("returns the target response untouched (no status check)", async () => {
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/auth/csrf")
          ? new Response("t")
          : new Response("nope", { status: 401 })
      )
    );
    const res = await fetchWithCsrf("refresh", { method: "POST" });
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("nope");
  });
});
