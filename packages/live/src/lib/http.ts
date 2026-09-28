// A small typed fetch helper for the API calls the SDKs have no method for
// (registering agents, importing a policy, properties, settings, ...). Each
// call site says which SDK method is missing.
//
// Nothing here prints a secret or a token: error messages carry the method,
// a redacted path, the status and the API's own error code and message, and
// the response body is kept off the error's enumerable properties (vitest
// prints those when a test fails).

import type { LiveEnv } from "../env";

export type Auth = "secret" | "none" | { bearer: string } | { access: string };

export type CallOptions = {
  body?: unknown;
  /** application/x-www-form-urlencoded body (OAuth token endpoint). */
  form?: Record<string, string>;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
  /** Default: the app's secret key. */
  auth?: Auth;
  /** Statuses that are answers, not errors (default: any 2xx). */
  expect?: number[];
  redirect?: RequestRedirect;
};

export type Answer<T> = { status: number; data: T; headers: Headers };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The path without its query, and long opaque segments (tokens) cut. */
export function safePath(path: string): string {
  return path
    .split("?")[0]
    .split("/")
    .map((seg) => (seg.length >= 24 && !UUID.test(seg) && !/^app_[A-Za-z0-9]+$/.test(seg) ? "<redacted>" : seg))
    .join("/");
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  declare readonly body: unknown;

  constructor(status: number, code: string | undefined, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    // Not enumerable: a failing test prints an error's enumerable fields.
    Object.defineProperty(this, "body", { value: body, enumerable: false });
  }
}

export class Api {
  constructor(private readonly env: LiveEnv) {}

  get base() {
    return this.env.baseUrl;
  }

  get appId() {
    return this.env.appId;
  }

  /** /v1/apps/:app_id */
  get appPath() {
    return `/v1/apps/${encodeURIComponent(this.env.appId)}`;
  }

  /** /v1/auth/:app_id */
  get authPath() {
    return `/v1/auth/${encodeURIComponent(this.env.appId)}`;
  }

  async call<T = any>(method: string, path: string, options: CallOptions = {}): Promise<Answer<T>> {
    const url = new URL(`${this.env.baseUrl}${path}`);
    for (const [k, v] of Object.entries(options.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { Accept: "application/json", ...(options.headers ?? {}) };
    const auth = options.auth ?? "secret";
    if (auth === "secret") headers.Authorization = `Bearer ${this.env.secret}`;
    else if (auth !== "none" && "bearer" in auth) headers.Authorization = `Bearer ${auth.bearer}`;
    else if (auth !== "none" && "access" in auth) headers["X-Authorization"] = auth.access;

    let body: string | undefined;
    if (options.form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(options.form).toString();
    } else if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    let res: Response;
    try {
      res = await fetch(url, { method, headers, body, redirect: options.redirect ?? "follow" });
    } catch (e) {
      const cause = (e as { cause?: { message?: string } }).cause?.message;
      throw new Error(`${method} ${safePath(path)} didn't reach the API: ${(e as Error).message}${cause ? ` (${cause})` : ""}`);
    }
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    const expected = options.expect ? options.expect.includes(res.status) : res.status >= 200 && res.status < 300;
    if (!expected) {
      const code = typeof data === "object" && data ? data.error_code ?? data.error : undefined;
      const said = typeof data === "object" && data ? data.error_description ?? data.error ?? data.message : undefined;
      throw new ApiError(
        res.status,
        typeof code === "string" ? code : undefined,
        `${method} ${safePath(path)} answered ${res.status}${typeof code === "string" ? ` (${code})` : ""}${
          typeof said === "string" && said !== code ? `: ${said}` : ""
        }`,
        data
      );
    }
    return { status: res.status, data: data as T, headers: res.headers };
  }

  get<T = any>(path: string, options?: CallOptions) {
    return this.call<T>("GET", path, options);
  }

  post<T = any>(path: string, body?: unknown, options: CallOptions = {}) {
    return this.call<T>("POST", path, { ...options, body });
  }

  patch<T = any>(path: string, body?: unknown, options: CallOptions = {}) {
    return this.call<T>("PATCH", path, { ...options, body });
  }

  put<T = any>(path: string, body?: unknown, options: CallOptions = {}) {
    return this.call<T>("PUT", path, { ...options, body });
  }

  delete<T = any>(path: string, options?: CallOptions) {
    return this.call<T>("DELETE", path, options);
  }
}
