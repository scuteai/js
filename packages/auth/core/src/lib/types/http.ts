export type BaseHttpErrorObject<T = Record<string, any>> = {
  status: number;
  message: string;
  json: T;
  _responseObject: Response;
};

export type BaseResponse<T = any, K = any> = Promise<
  | {
      data: T;
      error: null;
    }
  | {
      data: null;
      error: BaseHttpErrorObject<K>;
    }
>;
