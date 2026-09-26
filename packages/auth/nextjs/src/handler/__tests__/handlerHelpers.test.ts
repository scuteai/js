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

  it("GETs the csrf handler first, then calls the target handler with the token header", async () => {
    install();
    const res = await fetchWithCsrf("sign-out", { method: "POST" });

    expect(res.status).toBe(200);
    expect(calls.map((c) => c.url)).toEqual(["/auth/csrf", "/auth/sign-out"]);
    // the token request is a bare GET (no init)
    expect(calls[0].init).toBeUndefined();
    expect(calls[1].init).toEqual({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "tok-1",
      },
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
    expect(calls[1].init?.headers).toEqual({
      Authorization: "Bearer abc",
      "Content-Type": "application/json",
      "X-CSRF-Token": "tok-1",
    });
  });

  it("overrides a caller-supplied Content-Type and X-CSRF-Token", async () => {
    install();
    await fetchWithCsrf("sign-in", {
      method: "POST",
      headers: { "Content-Type": "text/plain", "X-CSRF-Token": "forged" },
    });
    expect(calls[1].init?.headers).toEqual({
      "Content-Type": "application/json",
      "X-CSRF-Token": "tok-1",
    });
  });

  // CURRENT BEHAVIOR (suspected bug): headers are merged with object spread,
  // so a `Headers` instance (or an array of tuples) is silently dropped.
  // Today every internal caller passes a plain object, so it is latent.
  it("drops caller headers passed as a Headers instance", async () => {
    install();
    await fetchWithCsrf("sign-in", {
      method: "POST",
      headers: new Headers({ Authorization: "Bearer abc" }),
    });
    expect(calls[1].init?.headers).toEqual({
      "Content-Type": "application/json",
      "X-CSRF-Token": "tok-1",
    });
  });

  it("still sends the request with an empty token when the csrf fetch rejects", async () => {
    install(async () => {
      throw new Error("offline");
    });
    const res = await fetchWithCsrf("sign-out", { method: "POST" });
    expect(res.status).toBe(200);
    expect((calls[1].init?.headers as any)["X-CSRF-Token"]).toBe("");
  });

  // CURRENT BEHAVIOR (suspected bug, low): the csrf response status is not
  // checked, so an error page body (here "CSRF error") is sent back as the
  // token. The server then rejects it, so this fails closed.
  it("uses whatever body the csrf endpoint returns as the token, even on error status", async () => {
    install(async () => new Response("Bad Request", { status: 400 }));
    await fetchWithCsrf("refresh", { method: "POST" });
    expect((calls[1].init?.headers as any)["X-CSRF-Token"]).toBe("Bad Request");
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
