import { apiClient } from "./scute/apiClient";
import { ScuteApp } from "./types/app";
import { createQueryKeys } from "@lukemorales/query-key-factory";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MutationConfig, QueryConfig } from "./types/query";
import { queryClient } from "./pages/_app";
import { UniqueIdentifier } from "./types";

export const appsQuery = createQueryKeys("apps", {
  list: () => ({
    queryKey: [""],
    queryFn: getApps,
  }),
  app: (appId: UniqueIdentifier) => ({
    queryKey: [appId],
    // queryFn: () => getApp(appId),
  }),
});

export const invalidateAllQueries = () => {
  queryClient.invalidateQueries();
};

export const useAppsList = (config?: QueryConfig<typeof appsQuery.list>) => {
  //@ts-ignore // TODO: (just ts type error)
  return useQuery({ ...appsQuery.list(), ...config });
};

export const getApps = async (): Promise<ScuteApp> => {
  return apiClient.get("/v1/apps");
};
