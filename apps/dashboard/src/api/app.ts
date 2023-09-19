import "server-only";

import { getInternalApiClient } from "./base";
import type {
  Prettify,
  ScuteApp,
  ScuteAppData,
  UniqueIdentifier,
} from "@/types";

export const getApps = async () => {
  const { api } = await getInternalApiClient();

  const data = (await api.get("/v1/apps")) as { apps: ScuteApp[] } | null;
  return data;
};

export const getApp = async (appId: UniqueIdentifier) => {
  const { scuteClient } = await getInternalApiClient(appId);
  const { data } = await scuteClient.admin.getAppData();

  return data;
};

export const createApp = async (app: Partial<ScuteApp>) => {
  const { api } = await getInternalApiClient();

  const data = (await api.url("/v1/apps").post({
    app,
  })) as { app: ScuteAppData } | null;

  return data;
};

export type UpdateAppBodyParams = Partial<
  Prettify<
    Pick<
      ScuteAppData,
      "name" | "origin" | "colors" | "callback_url" | "login_url"
    > & {
      auth: Pick<
        ScuteAppData,
        | "public_signup"
        | "profile_management"
        | "access_expiration"
        | "refresh_expiration"
        | "auto_refresh"
        | "refresh_payload"
        | "session_timeout"
        | "scute_branding"
        | "magic_link_expiration"
      >;
    }
  >
>;

export const updateApp = async (
  id: UniqueIdentifier,
  appData: UpdateAppBodyParams
) => {
  const { api } = await getInternalApiClient(id);

  const data = (await api.url(`/v1/apps/${id}`).patch({ app: appData })) as {
    app: ScuteAppData;
  } | null;

  return data;
};

export const deleteApp = async (appId: UniqueIdentifier) => {
  const { api } = await getInternalApiClient(appId);

  return api
    .resolve((resolver) => resolver.res((res) => res.ok), true)
    .delete(`/v1/apps/${appId}`);
};
