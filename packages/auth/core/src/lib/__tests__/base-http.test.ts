/**
 * Characterization of ScuteBaseHttp: request shape, status to error class
 * mapping, retry policy, body parsing, sandbox detection and error
 * reporting. Goes through the real wretch stack with a stubbed fetch, so
 * what is pinned here is what callers actually receive.
 * (The 403 sso_required mapper itself is covered in sso-required-error.test.ts.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScuteBaseHttp } from "../ScuteBaseHttp";
import { BaseHttpError, InvalidAuthTokenError, SsoRequiredError, TechnicalError } from "../errors";
import {
  captureUnhandledRejections,
  createServer,
  installBrowser,
  type TestServer,
} from "../../__tests__/harness";

class TestHttp extends ScuteBaseHttp {
  doGet<T = any>(url: string, headers?: HeadersInit) {
    return this.get<T>(url, headers);
  }
  doPost<T = any>(url: string, data: any, headers?: HeadersInit) {
    return this.post<T>(url, data, headers);
  }
  doPut<T = any>(url: string, data: any, headers?: HeadersInit) {
    return this.put<T>(url, data, headers);
  }
  doPatch<T = any>(url: string, data: any, headers?: HeadersInit) {
    return this.patch<T>(url, data, headers);
  }
  doDelete(url: string, headers?: HeadersInit) {
    return this.delete(url, headers);
  }
  report(error: Error, userId?: string, url?: string, label?: string) {
    return this._reportError(error, userId, url, label);
  }
}

const BASE = "https://api.test/v1/auth/app_x";
let server: TestServer;
let http: TestHttp;

beforeEach(() => {
  server = createServer({ appData: null });
  http = new TestHttp(false, BASE, { credentials: "include" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("successful requests", () => {
  it("get/post/put/patch resolve { data, error: null } with the parsed JSON", async () => {
    server
      .on("GET", "/v1/auth/app_x/thing", { body: { ok: "get" } })
      .on("POST", "/v1/auth/app_x/thing", { body: { ok: "post" } })
      .on("PUT", "/v1/auth/app_x/thing", { body: { ok: "put" } })
      .on("PATCH", "/v1/auth/app_x/thing", { body: { ok: "patch" } });

    expect(await http.doGet("/thing")).toEqual({ data: { ok: "get" }, error: null });
    expect(await http.doPost("/thing", { a: 1 })).toEqual({ data: { ok: "post" }, error: null });
    expect(await http.doPut("/thing", { a: 1 })).toEqual({ data: { ok: "put" }, error: null });
    expect(await http.doPatch("/thing", { a: 1 })).toEqual({ data: { ok: "patch" }, error: null });
  });

  it("delete never parses the body and resolves { data: null, error: null }", async () => {
    server.on("DELETE", "/v1/auth/app_x/thing", { status: 200, raw: "not json at all" });
    expect(await http.doDelete("/thing")).toEqual({ data: null, error: null });
  });

  // CURRENT BEHAVIOR (suspected bug): delete() awaits wretch's response chain
  // object, which is not a promise, so it resolves as soon as the request is
  // dispatched. Callers (signOut, revokeSession, removeMfaMethod, ...) get
  // "success" before the server has answered.
  it("delete resolves before the HTTP request has completed (fire and forget)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.on("DELETE", "/v1/auth/app_x/thing", async () => {
      await gate;
      return { status: 200, body: {} };
    });

    const result = await http.doDelete("/thing");
    expect(result).toEqual({ data: null, error: null });
    expect(server.callsTo("DELETE", "/v1/auth/app_x/thing")).toHaveLength(1);
    release();
  });

  it("appends the path to the base URL, JSON-encodes bodies and merges headers", async () => {
    server.on("POST", "/v1/auth/app_x/thing", { body: {} });
    await http.doPost("/thing", { a: 1 }, { "X-Custom": "yes" });

    const [call] = server.callsTo("POST", "/v1/auth/app_x/thing");
    expect(call.url).toBe(`${BASE}/thing`);
    expect(call.body).toEqual({ a: 1 });
    expect(call.headers["content-type"]).toBe("application/json");
    expect(call.headers["x-custom"]).toBe("yes");
    expect(call.credentials).toBe("include");
  });

  it("sends no body for a null payload", async () => {
    server.on("POST", "/v1/auth/app_x/thing", { body: {} });
    await http.doPost("/thing", null);
    const [call] = server.callsTo("POST", "/v1/auth/app_x/thing");
    expect(call.body).toBeUndefined();
    expect(call.headers["content-type"]).toBeUndefined();
  });
});

describe("HTTP error mapping", () => {
  it.each([400, 401, 403, 404, 409, 422, 429])(
    "%i becomes a BaseHttpError with that code, the parsed body, and no retry",
    async (status) => {
      server.on("POST", "/v1/auth/app_x/thing", {
        status,
        body: { error: `status ${status}`, error_code: "some_code" },
      });
      const { data, error } = await http.doPost("/thing", {});

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(BaseHttpError);
      expect(error).not.toBeInstanceOf(SsoRequiredError);
      expect(error).not.toBeInstanceOf(InvalidAuthTokenError);
      expect(error!.code).toBe(status);
      expect(error!.json).toEqual({ error: `status ${status}`, error_code: "some_code" });
      expect(server.callsTo("POST", "/v1/auth/app_x/thing")).toHaveLength(1);
    }
  );

  it("takes the message from the status text, never from the response body", async () => {
    server.on("POST", "/v1/auth/app_x/thing", {
      status: 422,
      statusText: "Unprocessable Entity",
      body: { error: "Email is invalid" },
    });
    const { error } = await http.doPost("/thing", {});
    expect(error!.message).toBe("Unprocessable Entity");
    expect(error!.json!.error).toBe("Email is invalid");
    expect(error!.name).toBe("Error");
  });

  it("has an empty message when the server sends no status text", async () => {
    server.on("GET", "/v1/auth/app_x/thing", { status: 400, body: { error: "x" } });
    const { error } = await http.doGet("/thing");
    expect(error!.message).toBe("");
  });

  it("maps a 403 sso_required response on the wire to SsoRequiredError", async () => {
    server.on("POST", "/v1/auth/app_x/thing", {
      status: 403,
      body: {
        error: "SSO",
        error_code: "sso_required",
        details: { sso_login_url: "https://api.test/sso", domain: "acme.com" },
      },
    });
    const { error } = await http.doPost("/thing", {});
    expect(error).toBeInstanceOf(SsoRequiredError);
    expect((error as SsoRequiredError).ssoLoginUrl).toBe("https://api.test/sso");
  });

  it("only 403 carries sso_required semantics: the same body on 401 is a plain BaseHttpError", async () => {
    server.on("POST", "/v1/auth/app_x/thing", {
      status: 401,
      body: { error_code: "sso_required" },
    });
    const { error } = await http.doPost("/thing", {});
    expect(error).not.toBeInstanceOf(SsoRequiredError);
    expect(error!.code).toBe(401);
  });

  it("500 is not retried", async () => {
    server.on("GET", "/v1/auth/app_x/thing", { status: 500, body: { error: "boom" } });
    const { error } = await http.doGet("/thing");
    expect(error!.code).toBe(500);
    expect(server.callsTo("GET", "/v1/auth/app_x/thing")).toHaveLength(1);
  });

  it.each([502, 503, 504])(
    "%i is retried 3 more times (500ms, 1000ms, 1500ms) and then surfaced",
    async (status) => {
      vi.useFakeTimers();
      server.on("GET", "/v1/auth/app_x/thing", { status, body: { error: "upstream" } });

      const pending = http.doGet("/thing");
      await vi.advanceTimersByTimeAsync(499);
      expect(server.callsTo("GET", "/v1/auth/app_x/thing")).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(server.callsTo("GET", "/v1/auth/app_x/thing")).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(server.callsTo("GET", "/v1/auth/app_x/thing")).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(1500);

      const { error } = await pending;
      expect(server.callsTo("GET", "/v1/auth/app_x/thing")).toHaveLength(4);
      expect(error).toBeInstanceOf(BaseHttpError);
      expect(error!.code).toBe(status);
    }
  );

  it("a retried request that recovers resolves with the later success", async () => {
    vi.useFakeTimers();
    let n = 0;
    server.on("GET", "/v1/auth/app_x/thing", () =>
      ++n === 1 ? { status: 503, body: {} } : { body: { ok: true } }
    );
    const pending = http.doGet("/thing");
    await vi.advanceTimersByTimeAsync(600);
    expect(await pending).toEqual({ data: { ok: true }, error: null });
    expect(n).toBe(2);
  });

  it("a non-JSON error body leaves json undefined but keeps the status", async () => {
    server.on("GET", "/v1/auth/app_x/thing", {
      status: 500,
      raw: "<html>Internal Server Error</html>",
      headers: { "Content-Type": "text/html" },
    });
    const { error } = await http.doGet("/thing");
    expect(error).toBeInstanceOf(BaseHttpError);
    expect(error!.code).toBe(500);
    expect(error!.json).toBeUndefined();
  });

  it("parses a JSON-looking error body even when the content type is not JSON", async () => {
    server.on("GET", "/v1/auth/app_x/thing", {
      status: 400,
      raw: '{"error":"plain text header"}',
      headers: { "Content-Type": "text/plain" },
    });
    const { error } = await http.doGet("/thing");
    expect(error!.json).toEqual({ error: "plain text header" });
  });

  it("a 2xx response with a non-JSON body becomes an error with no code", async () => {
    server.on("GET", "/v1/auth/app_x/thing", { status: 200, raw: "OK" });
    const { data, error } = await http.doGet("/thing");
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(BaseHttpError);
    expect(error!.code).toBeUndefined();
    expect(error!.cause).toBeInstanceOf(SyntaxError);
  });

  // CURRENT BEHAVIOR (suspected bug): get/post/put/patch always call
  // .json(), so a 204 No Content success is reported as an error with an
  // undefined code. Any endpoint that answers 204 to a POST/PATCH looks
  // failed to the caller.
  it("a 204 No Content on post is reported as an error", async () => {
    server.on("POST", "/v1/auth/app_x/thing", { status: 204 });
    const { data, error } = await http.doPost("/thing", {});
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(BaseHttpError);
    expect(error!.code).toBeUndefined();
  });

  it("a network failure is retried 3 times, then becomes a BaseHttpError with no code or message", async () => {
    vi.useFakeTimers();
    const netErr = new TypeError("fetch failed");
    server.on("GET", "/v1/auth/app_x/thing", netErr);

    const pending = http.doGet("/thing");
    await vi.advanceTimersByTimeAsync(3000);
    const { error } = await pending;

    expect(server.callsTo("GET", "/v1/auth/app_x/thing")).toHaveLength(4);
    expect(error).toBeInstanceOf(BaseHttpError);
    expect(error).not.toBeInstanceOf(TechnicalError);
    expect(error!.code).toBeUndefined();
    expect(error!.message).toBe("");
    expect(error!.name).toBe("TypeError");
    expect(error!.cause).toBe(netErr);
    expect(error!.json).toBeUndefined();
  });

  // CURRENT BEHAVIOR (suspected bug): because delete() never awaits the
  // response, an error status is NOT mapped: the call reports success and
  // the WretchError escapes as an unhandled promise rejection. Every DELETE
  // in the SDK (sign out, session revoke, MFA method removal, admin
  // deleteUser, ...) therefore reports success when the server refused it.
  it.each([401, 404, 500])(
    "delete reports success for a %i and leaks the error as an unhandled rejection",
    async (status) => {
      server.on("DELETE", "/v1/auth/app_x/thing", { status, body: { error: "refused" } });

      let result: unknown;
      const leaked = await captureUnhandledRejections(async () => {
        result = await http.doDelete("/thing");
      });

      expect(result).toEqual({ data: null, error: null });
      expect(leaked).toHaveLength(1);
      expect((leaked[0] as any).status).toBe(status);
      expect((leaked[0] as any).json).toEqual({ error: "refused" });
    }
  );
});

describe("sandbox detection", () => {
  it("defaults to production", () => {
    expect(http.isSandbox).toBe(false);
    expect(http.environment).toBe("production");
  });

  it("X-Scute-Sandbox: true flips to sandbox, even on an error response", async () => {
    server.on("GET", "/v1/auth/app_x/thing", {
      status: 400,
      body: {},
      headers: { "X-Scute-Sandbox": "true" },
    });
    await http.doGet("/thing");
    expect(http.isSandbox).toBe(true);
    expect(http.environment).toBe("sandbox");
  });

  it("X-Scute-Environment sets the environment name without sandbox", async () => {
    server.on("GET", "/v1/auth/app_x/thing", {
      body: {},
      headers: { "X-Scute-Environment": "staging" },
    });
    await http.doGet("/thing");
    expect(http.isSandbox).toBe(false);
    expect(http.environment).toBe("staging");
  });

  it("sandbox is sticky: a later response without the header does not reset it", async () => {
    let first = true;
    server.on("GET", "/v1/auth/app_x/thing", () => {
      const headers: Record<string, string> = first ? { "X-Scute-Sandbox": "true" } : {};
      first = false;
      return { body: {}, headers };
    });
    await http.doGet("/thing");
    await http.doGet("/thing");
    expect(http.isSandbox).toBe(true);
    expect(http.environment).toBe("sandbox");
  });
});

describe("error reporting (_reportError)", () => {
  const reportCalls = () => server.callsTo("POST", "/v1/auth/app_x/errors");

  it("never reports outside a browser, even when enabled", async () => {
    const reporting = new TestHttp(true, BASE);
    server.on("GET", "/v1/auth/app_x/thing", { status: 500, body: {} });
    await reporting.doGet("/thing");
    await new Promise((r) => setTimeout(r, 0));
    expect(reportCalls()).toHaveLength(0);
  });

  it("does not report when disabled, or for statuses below 500", async () => {
    installBrowser();
    server.on("GET", "/v1/auth/app_x/fail500", { status: 500, body: {} });
    server.on("GET", "/v1/auth/app_x/fail404", { status: 404, body: {} });

    await new TestHttp(false, BASE).doGet("/fail500");
    await new TestHttp(true, BASE).doGet("/fail404");
    await new Promise((r) => setTimeout(r, 0));
    expect(reportCalls()).toHaveLength(0);
  });

  it("reports a 5xx in the browser to <base>/errors with location, code and label", async () => {
    installBrowser({ href: "https://app.test/dashboard?tab=1" });
    const reporting = new TestHttp(true, BASE);
    server.on("GET", "/v1/auth/app_x/thing", { status: 500, statusText: "Internal Server Error", body: { error: "boom" } });
    server.on("POST", "/v1/auth/app_x/errors", { body: {} });

    await reporting.doGet("/thing");
    await vi.waitFor(() => expect(reportCalls()).toHaveLength(1));

    const { payload } = reportCalls()[0].body;
    expect(payload.label).toBe("http");
    expect(payload.user).toEqual({});
    expect(payload.error).toMatchObject({
      location: "https://app.test/dashboard?tab=1",
      name: "Error",
      message: "Internal Server Error",
      code: 500,
    });
    expect(typeof payload.error.stack).toBe("string");
  });

  it("reports network failures too (an undefined code passes the < 500 gate)", async () => {
    vi.useFakeTimers();
    installBrowser();
    const reporting = new TestHttp(true, BASE);
    server.on("GET", "/v1/auth/app_x/thing", new TypeError("fetch failed"));
    server.on("POST", "/v1/auth/app_x/errors", { body: {} });

    const pending = reporting.doGet("/thing");
    await vi.advanceTimersByTimeAsync(3000);
    await pending;
    await vi.advanceTimersByTimeAsync(10);
    expect(reportCalls()).toHaveLength(1);
    expect(reportCalls()[0].body.payload.error.name).toBe("TypeError");
  });

  it("does not recurse when the /errors endpoint itself fails", async () => {
    installBrowser();
    const reporting = new TestHttp(true, BASE);
    server.on("GET", "/v1/auth/app_x/thing", { status: 500, body: {} });
    server.on("POST", "/v1/auth/app_x/errors", { status: 500, body: {} });

    await reporting.doGet("/thing");
    await vi.waitFor(() => expect(reportCalls()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(reportCalls()).toHaveLength(1);
  });

  it("passes the userId and label through when called directly", async () => {
    installBrowser();
    const reporting = new TestHttp(true, BASE);
    server.on("POST", "/v1/auth/app_x/errors", { body: {} });

    await reporting.report(new TechnicalError(), "user_7", undefined, "custom-label");
    const { payload } = reportCalls()[0].body;
    expect(payload.user).toEqual({ id: "user_7" });
    expect(payload.label).toBe("custom-label");
    expect(payload.error.message).toBe("Technical Error");
  });
});
