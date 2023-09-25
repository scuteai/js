import "server-only";

import { getInternalApiClient } from "./base";
import type { UniqueIdentifier, ScuteIdentifier, ScuteUserData, UserMeta, } from "@/types";

export const getUsers = async (appId: UniqueIdentifier, params?: any) => {
  const { scuteClient } = await getInternalApiClient(appId);
  const { data } = await scuteClient.admin.listUsers(params);

  return data;
};

export const inviteUser = async (
  appId: UniqueIdentifier,
  identifier: ScuteIdentifier,
  userMeta?: UserMeta
) => {
  const { scuteClient } = await getInternalApiClient(appId);
  const { data } = await scuteClient.admin.inviteUser(identifier, userMeta);

  return data?.user;
};
