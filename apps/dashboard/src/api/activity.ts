import "server-only";

import type {
  ScuteEvent,
  ScutePaginationMeta,
  UniqueIdentifier,
} from "@/types";
import { getInternalApiClient } from "./base";

export const getEvents = async (appId: UniqueIdentifier, params?: any) => {
  const { api } = await getInternalApiClient(appId);

  const { events, ...pagination } = (await api.get(
    `/v1/apps/${appId}/events` +
      (params ? `?${new URLSearchParams(params)}` : "")
  )) as ScutePaginationMeta & {
    events: ScuteEvent[];
  };

  return {
    pagination,
    events,
  };
};
