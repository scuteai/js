import wretch, { type Wretch, type WretchError } from "wretch";
import { retry } from "wretch/middlewares/retry";
import {
  BaseHttpError,
  SsoRequiredError,
  ErrorReport,
  NETWORK_ERROR_CODES,
  ScuteError,
} from "./errors";
import type { BaseResponse, UniqueIdentifier } from "./types/general";
import { isBrowser, scrubAuthTokensFromUrl } from "./helpers";
import { _SCUTE_REFRESH_HEADER } from "./constants";

/**
 * Requests that present a refresh token are never replayed, so an ambiguous
 * failure (502/503/504 or a dropped connection) cannot send the same refresh
 * token twice. The session layer retries on its next refresh instead.
 */
const carriesRefreshToken = (opts: { headers?: HeadersInit } | undefined) => {
  try {
    return new Headers(opts?.headers).has(_SCUTE_REFRESH_HEADER);
  } catch {
    return false;
  }
};

/**
 * Only idempotent requests (GET, HEAD, DELETE) are retried. A POST, PUT or
 * PATCH (sign-in codes, magic links, token exchanges) that failed
 * ambiguously may already have been applied, so it is never sent again.
 */
const RETRYABLE_METHODS = ["GET", "HEAD", "DELETE"];
const isRetryable = (opts: { method?: string; headers?: HeadersInit } | undefined) =>
  RETRYABLE_METHODS.includes((opts?.method ?? "GET").toUpperCase()) && !carriesRefreshToken(opts);

/** A JSON body, or null for a success without content (204/205). */
const jsonOrNull = async <T>(response: Response): Promise<T> => {
  if (response.status === 204 || response.status === 205) return null as T;
  return (await response.json()) as T;
};

/** The page URL for an error report, without Scute's one-time sign-in tokens. */
const reportLocation = () => {
  try {
    return scrubAuthTokensFromUrl(window.location.toString());
  } catch {
    return "";
  }
};

export abstract class ScuteBaseHttp {
  protected wretcher: Wretch;
  protected reportErrors: boolean;
  protected _isSandbox: boolean = false;
  protected _environment: string = "production";

  constructor(
    reportErrors: boolean = false,
    ...params: Parameters<typeof wretch>
  ) {
    this.reportErrors = reportErrors ?? false;

    // Middleware to capture sandbox header from responses
    const sandboxDetector = (next: any) => (url: string, opts: any) => {
      return next(url, opts).then((response: Response) => {
        const sandboxHeader = response.headers.get("X-Scute-Sandbox");
        const envHeader = response.headers.get("X-Scute-Environment");
        if (sandboxHeader === "true") {
          this._isSandbox = true;
          this._environment = "sandbox";
        } else if (envHeader) {
          this._environment = envHeader;
        }
        return response;
      });
    };

    this.wretcher = wretch(...params)
      .middlewares([
        sandboxDetector,
        retry({
          delayTimer: 500,
          delayRamp: (delay, nbOfAttempts) => delay * nbOfAttempts,
          maxAttempts: 3,
          until: (response, error) =>
            response ? !NETWORK_ERROR_CODES.includes(response.status) : !error,
          onRetry: undefined,
          retryOnNetworkError: true,
          resolveWithLatestResponse: true,
          skip: (_url, opts) => !isRetryable(opts),
        }),
      ])
      .errorType("json");
  }

  /** Whether the connected app is in a sandbox workspace */
  get isSandbox(): boolean {
    return this._isSandbox;
  }

  /** Current environment: "production" or "sandbox" */
  get environment(): string {
    return this._environment;
  }

  protected async get<T>(url: string, headers?: HeadersInit): BaseResponse<T> {
    try {
      const response = await this.wretcher
        .url(url)
        .headers(headers as any)
        .get()
        .res(jsonOrNull<T>);

      return { data: response, error: null };
    } catch (e) {
      const error = this._getErrorObject(e as WretchError);
      this._reportError(error, undefined, url, "http");
      return { data: null, error };
    }
  }

  protected async post<T>(
    url: string,
    data: any,
    headers?: HeadersInit
  ): BaseResponse<T> {
    try {
      const response = await this.wretcher
        .url(url)
        .headers(headers as any)
        .post(data)
        .res(jsonOrNull<T>);
      return { data: response, error: null };
    } catch (e) {
      const error = this._getErrorObject(e as WretchError);
      this._reportError(error, undefined, url, "http");
      return { data: null, error };
    }
  }

  protected async put<T>(
    url: string,
    data: any,
    headers?: HeadersInit
  ): BaseResponse<T> {
    try {
      const response = await this.wretcher
        .url(url)
        .headers(headers as any)
        .put(data)
        .res(jsonOrNull<T>);
      return { data: response, error: null };
    } catch (e) {
      const error = this._getErrorObject(e as WretchError);
      this._reportError(error, undefined, url, "http");
      return { data: null, error };
    }
  }

  protected async patch<T>(
    url: string,
    data: any,
    headers?: HeadersInit
  ): BaseResponse<T> {
    try {
      const response = await this.wretcher
        .url(url)
        .headers(headers as any)
        .patch(data)
        .res(jsonOrNull<T>);
      return { data: response, error: null };
    } catch (e) {
      const error = this._getErrorObject(e as WretchError);
      this._reportError(error, undefined, url, "http");
      return { data: null, error };
    }
  }

  protected async delete(url: string, headers?: HeadersInit): BaseResponse {
    try {
      // `.res()` waits for the response and rejects on an error status, so
      // failures are mapped like the other verbs. The body is not parsed.
      await this.wretcher
        .url(url)
        .headers(headers as any)
        .delete()
        .res();
      return { data: null, error: null };
    } catch (e) {
      const error = this._getErrorObject(e as WretchError);
      this._reportError(error, undefined, url, "http");
      return { data: null, error };
    }
  }

  protected async _reportError(
    error: Error,
    userId?: UniqueIdentifier,
    url?: string,
    label?: string
  ) {
    const shouldNotReport =
      !this.reportErrors ||
      (error instanceof BaseHttpError && error.code < 500) ||
      !isBrowser() ||
      (url && url.endsWith("errors"));

    if (shouldNotReport) {
      return;
    }

    let errorData: ErrorReport = {
      location: reportLocation(),
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    if (error instanceof ScuteError) {
      errorData = {
        ...errorData,
        code: error.code,
        cause: error.cause,
      };
    }

    try {
      const payload = {
        error: errorData,
        user: { id: userId },
        label: label,
      };
      await this.post("/errors", { payload });
    } catch (error) {
      console.warn("Error reporting failed", error);
    }
  }

  private _getErrorObject(error: WretchError) {
    const message = this._getErrorMessage(error);
    const code = error.status;

    if (code === 403 && error.json?.error_code === "sso_required") {
      return new SsoRequiredError({ cause: error, message, json: error.json });
    }

    return new BaseHttpError({
      cause: error,
      message,
      json: error.json,
      code,
    });
  }

  private _getErrorMessage(error: WretchError) {
    const message =
      typeof error.message === "object" && Object.keys(error.message).length > 0
        ? JSON.stringify(error.message)
        : error.response?.statusText;

    return message;
  }
}
