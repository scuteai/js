import "server-only";

import { getInternalApiClient } from "./base";
import type { Metafield, UniqueIdentifier } from "@/types";

export const getMetaFields = async (appId: UniqueIdentifier) => {
  const { api } = await getInternalApiClient(appId);
  const data = (await api.get(`/v1/apps/${appId}/user_meta_fields`)) as {
    user_meta_data_schema: Metafield[];
  };

  return data.user_meta_data_schema;
};

export const createMetaField = async (
  appId: UniqueIdentifier,
  metafield: Omit<Partial<Metafield>, "id">
) => {
  const { api } = await getInternalApiClient(appId);
  const data = (await api
    .url(`/v1/apps/${appId}/user_meta_fields`)
    .post({ user_meta_field: metafield })) as Metafield | null;

  return data;
};

export const updateMetaField = async (
  appId: UniqueIdentifier,
  metafield: Omit<Partial<Metafield>, "id"> & { id: UniqueIdentifier }
) => {
  const { api } = await getInternalApiClient(appId);
  const data = (await api
    .url(`/v1/apps/${appId}/user_meta_fields/${metafield.id}`)
    .put({ user_meta_field: metafield })) as Metafield | null;

  return data;
};

export const deleteMetaField = async (
  appId: UniqueIdentifier,
  id: Metafield["id"]
) => {
  const { api } = await getInternalApiClient(appId);

  return api
    .resolve((resolver) => resolver.res((res) => res.ok), true)
    .delete(`/v1/apps/${appId}/user_meta_fields/${id}`);
};
