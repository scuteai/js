// Assertions that never print a token. The SDKs answer { data, error }; a
// failing test prints what it's given, so errors are turned into plain
// messages (status, the API's error code and sentence) before anything
// reaches vitest.

import { ScuteHarnessError } from "@scute/harness";
import { ApiError } from "./http";

/** "401 authentication_required: Authentication required" for any SDK or API error. */
export function describeError(error: unknown): string {
  if (!error) return "no error";
  if (error instanceof ApiError) return error.message;
  if (error instanceof ScuteHarnessError) {
    return `${error.status ?? "?"}${error.code ? ` ${error.code}` : ""}: ${error.message}`;
  }
  const e = error as {
    code?: unknown;
    json?: { error_code?: unknown; error?: unknown };
    name?: unknown;
    message?: unknown;
    cause?: { message?: unknown; cause?: { message?: unknown } };
  };
  const status = typeof e.code === "number" || typeof e.code === "string" ? String(e.code) : "";
  const code = typeof e.json?.error_code === "string" ? e.json.error_code : "";
  // A network failure has no status: say what the fetch said ("fetch failed (connect ECONNREFUSED)").
  const network = !status && typeof e.cause?.message === "string" ? `${e.cause.message}${typeof e.cause.cause?.message === "string" ? ` (${e.cause.cause.message})` : ""}` : "";
  const said =
    typeof e.json?.error === "string" ? e.json.error : typeof e.message === "string" && e.message ? e.message : network;
  const name = typeof e.name === "string" && e.name !== "Error" ? `${e.name} ` : "";
  return `${name}${[status, code].filter(Boolean).join(" ")}${said ? `: ${said}` : ""}`.trim() || "unknown error";
}

/** The data of an SDK answer, or a thrown Error that says what went wrong (and nothing secret). */
export function ok<R extends { data?: unknown; error?: unknown }>(result: R, what: string): Exclude<R["data"], null | undefined> {
  if (result.error) throw new Error(`${what} failed: ${describeError(result.error)}`);
  if (result.data === null || result.data === undefined) throw new Error(`${what} answered no data`);
  return result.data as Exclude<R["data"], null | undefined>;
}

/** For SDK calls that answer no data (deletes): only that there was no error. */
export function done(result: { error?: unknown }, what: string): void {
  if (result.error) throw new Error(`${what} failed: ${describeError(result.error)}`);
}

/** The error of an SDK answer that should have failed, as a plain description. */
export function failed<R extends { error?: unknown }>(result: R, what: string): { status?: number; code?: string; message: string } {
  if (!result.error) throw new Error(`${what} was expected to fail, but it went through`);
  return { status: statusOf(result.error), code: errorCodeOf(result.error), message: describeError(result.error) };
}

/** The HTTP status of an SDK error (BaseHttpError.code), if it has one. */
export function statusOf(error: unknown): number | undefined {
  if (error instanceof ApiError) return error.status;
  if (error instanceof ScuteHarnessError) return error.status;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "number" ? code : undefined;
}

/** The API's error_code on an SDK or API error. */
export function errorCodeOf(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.code;
  if (error instanceof ScuteHarnessError) return error.code;
  const code = (error as { json?: { error_code?: unknown } } | null)?.json?.error_code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Run a harness call; a ScuteHarnessError comes back as a plain Error (its
 * `body` can hold a challenge token, and vitest would print it).
 */
export async function safely<T>(fn: () => Promise<T>, what: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ScuteHarnessError || e instanceof ApiError) {
      const clean = new Error(`${what} failed: ${describeError(e)}`) as Error & { status?: number; code?: string };
      clean.status = e.status;
      clean.code = e.code;
      throw clean;
    }
    throw e;
  }
}

/** A plain Error for an expected refusal: status and code, nothing else. */
export async function refusal(fn: () => Promise<unknown>): Promise<{ status?: number; code?: string; message: string }> {
  try {
    await fn();
  } catch (e) {
    return { status: statusOf(e), code: errorCodeOf(e), message: describeError(e) };
  }
  throw new Error("expected a refusal, but the call went through");
}

/** Poll until `fn` returns something truthy (rows written by a background job). */
export async function eventually<T>(
  fn: () => Promise<T | undefined | null | false>,
  { timeoutMs = 45_000, intervalMs = 1_500, what = "the condition" } = {}
): Promise<T> {
  const until = Date.now() + timeoutMs;
  let last: unknown;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (e) {
      last = e;
    }
    if (Date.now() > until) {
      throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${what}${last ? ` (last error: ${describeError(last)})` : ""}`);
    }
    await sleep(intervalMs);
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A token with one character of its signature changed. */
export function tamper(jwt: string): string {
  const [h, p, s] = jwt.split(".");
  const i = Math.floor(s.length / 2);
  const swapped = s[i] === "A" ? "B" : "A";
  return `${h}.${p}.${s.slice(0, i)}${swapped}${s.slice(i + 1)}`;
}

/** The claims of a JWT, unverified (for reading, never for deciding). */
export function claimsOf(jwt: string): Record<string, any> {
  const part = jwt.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}
