import "server-only";

import type {
  ListEventsParams,
  ScuteEvent,
  ScutePaginationMeta,
  UniqueIdentifier,
} from "@/types";
import { getInternalApiClient } from "./base";

export const getEvents = async (
  appId: UniqueIdentifier,
  params?: ListEventsParams
) => {
  const { api } = await getInternalApiClient(appId);

  const { events, ...pagination } = (await api.get(
    `/v1/apps/${appId}/events` +
      (params ? `?${new URLSearchParams(params as Record<string, any>)}` : "")
  )) as ScutePaginationMeta & {
    events: ScuteEvent[];
  };

  return {
    pagination,
    events,
  };
};
