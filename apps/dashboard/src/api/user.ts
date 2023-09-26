import "server-only";

import { getInternalApiClient } from "./base";
import type {
  UniqueIdentifier,
  ScuteIdentifier,
  ScuteUserData,
  UserMeta,
  ListUsersRequestParams,
} from "@/types";

export const getUsers = async (
  appId: UniqueIdentifier,
  params?: ListUsersRequestParams
) => {
  const { scuteClient } = await getInternalApiClient(appId);
  const { data } = await scuteClient.admin.listUsers(params);

  return data;
};

export const activateUser = async (
  appId: UniqueIdentifier,
  userId: UniqueIdentifier
) => {
  const { scuteClient } = await getInternalApiClient(appId);
  const { data } = await scuteClient.admin.activateUser(userId);

  return data?.user;
};

export const deactivateUser = async (
  appId: UniqueIdentifier,
  userId: UniqueIdentifier
) => {
  const { scuteClient } = await getInternalApiClient(appId);
  const { data } = await scuteClient.admin.deactivateUser(userId);

  return data?.user;
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
