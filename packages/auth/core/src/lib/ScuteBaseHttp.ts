import wretch, { type Wretch, type WretchError } from "wretch";
import type { BaseHttpErrorObject, BaseResponse } from "./types/http";

export abstract class ScuteBaseHttp {
  protected readonly wretcher: Wretch;

  constructor(...params: Parameters<typeof wretch>) {
    this.wretcher = wretch(...params).errorType("json");
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
      return { data: null, error: this._getErrorObject(e as WretchError) };
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
      return { data: null, error: this._getErrorObject(e as WretchError) };
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
      return { data: null, error: this._getErrorObject(e as WretchError) };
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
      return { data: null, error: this._getErrorObject(e as WretchError) };
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
      return { data: null, error: this._getErrorObject(e as WretchError) };
    }
  }

  private _getErrorObject(error: WretchError): BaseHttpErrorObject {
    return {
      status: error.status,
      message: this._getErrorMessage(error),
      json: error.json,
      _responseObject: error.response,
    };
  }

  private _getErrorMessage(error: WretchError) {
    const message =
      typeof error.message === "object" && Object.keys(error.message).length > 0
        ? JSON.stringify(error.message)
        : error.response?.statusText;

    return message;
  }
}
