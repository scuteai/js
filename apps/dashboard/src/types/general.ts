export type UniqueIdentifier = string | number;
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};
