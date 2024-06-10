import wretch, { type Wretch, type WretchError } from "wretch";
import { retry } from "wretch/middlewares/retry";
import {
  BaseHttpError,
  ErrorReport,
  NETWORK_ERROR_CODES,
  ScuteError,
} from "./errors";
import type { BaseResponse, UniqueIdentifier } from "./types/general";
import { isBrowser } from "./helpers";

export abstract class ScuteBaseHttp {
  protected wretcher: Wretch;
  protected reportErrors: boolean;

  constructor(
    reportErrors: boolean = false,
    ...params: Parameters<typeof wretch>
  ) {
    this.reportErrors = reportErrors ?? false;
    this.wretcher = wretch(...params)
      .middlewares([
        retry({
          delayTimer: 500,
          delayRamp: (delay, nbOfAttempts) => delay * nbOfAttempts,
          maxAttempts: 3,
          until: (response, error) =>
            response ? !NETWORK_ERROR_CODES.includes(response.status) : !error,
          onRetry: undefined,
          retryOnNetworkError: true,
          resolveWithLatestResponse: true,
        }),
      ])
      .errorType("json");
  }

  protected async get<T>(url: string, headers?: HeadersInit): BaseResponse<T> {
    try {
      const response = await this.wretcher
        .url(url)
        .headers(headers as any)
        .get()
        .json<T>();

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
        .json<T>();
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
        .json<T>();
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
        .json<T>();
      return { data: response, error: null };
    } catch (e) {
      const error = this._getErrorObject(e as WretchError);
      this._reportError(error, undefined, url, "http");
      return { data: null, error };
    }
  }

  protected async delete(url: string, headers?: HeadersInit): BaseResponse {
    try {
      await this.wretcher
        .url(url)
        .headers(headers as any)
        .delete();
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
      location: window.location.toString(),
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
