import "server-only";

import type { AppApiKey, UniqueIdentifier } from "@/types";
import { getInternalApiClient } from "./base";

export const getApiKeys = async (appId: UniqueIdentifier) => {
  const { api } = await getInternalApiClient(appId);

  const data = (await api.get(`/v1/apps/${appId}/api_keys`)) as {
    api_keys: AppApiKey[];
  };

  return data;
};

export const createApiKey = async (
  appId: UniqueIdentifier,
  nickname: AppApiKey["nickname"]
) => {
  const { api } = await getInternalApiClient(appId);

  const data = (await api.url(`/v1/apps/${appId}/api_keys`).post({
    api_keys: {
      nickname,
    },
  })) as { api_key: AppApiKey } | null;

  return data;
};

export const updateApiKey = async (
  appId: UniqueIdentifier,
  id: AppApiKey["bearer_id"],
  nickname: AppApiKey["nickname"]
) => {
  const { api } = await getInternalApiClient(appId);

  const data = (await api
    .url(`/v1/apps/${appId}/api_keys/${id}`)
    .patch({ api_keys: { nickname } })) as {
    api_key: AppApiKey;
  } | null;

  return data;
};

export const deleteApiKey = async (
  appId: UniqueIdentifier,
  id: AppApiKey["bearer_id"]
) => {
  const { api } = await getInternalApiClient(appId);

  return api
    .resolve((resolver) => resolver.res((res) => res.ok), true)
    .delete(`/v1/apps/${appId}/api_keys/${id}`);
};
