import "server-only";

import { getInternalApiClient } from "./base";
import type { UniqueIdentifier, ScuteUserData } from "@/types";

export const getUsers = async (appId: UniqueIdentifier, params?: any) => {
  const { scuteClient } = await getInternalApiClient(appId);
  const { data } = await scuteClient.admin.listUsers(params);

  return data;
};
