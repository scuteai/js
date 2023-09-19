import "server-only";

import type { ScuteEvent, UniqueIdentifier } from "@/types";
import { getInternalApiClient } from "./base";

export const getEvents = async (appId: UniqueIdentifier) => {
  const { api } = await getInternalApiClient(appId);

  const data = (await api.get(`/v1/apps/${appId}/events`)) as {
    events: ScuteEvent[];
  };

  return data;
};
