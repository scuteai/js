import type {
  UseMutationOptions,
  UseQueryOptions,
} from "@tanstack/react-query";
import type { AxiosError } from "axios";

export type QueryConfig<F extends (...args: any[]) => any> = Omit<
  UseQueryOptions<
    Awaited<ReturnType<ReturnType<F>["queryFn"]>>,
    AxiosError,
    Awaited<ReturnType<ReturnType<F>["queryFn"]>>,
    any[]
  >,
  "queryKey" | "queryFn"
>;

export type MutationConfig<F extends (...args: any) => any> = Omit<
  UseMutationOptions<Awaited<ReturnType<F>>, AxiosError, any, any>,
  "mutationKey" | "mutationFn"
>;
