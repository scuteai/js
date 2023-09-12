import 'server-only'

import { cookies } from "next/headers";
import {
  accessTokenHeader,
  createServerComponentClient,
  type ScuteClient,
} from "@scute/nextjs";
import wretch from "wretch";
import type { UniqueIdentifier, ScuteUserData } from "@/types";

const baseUrl =
  process.env.NEXT_PUBLIC_SCUTE_BASE_URL || "https://api.scute.io";

export const getScuteClient = (() => {
  const clientMap = new Map<UniqueIdentifier, ScuteClient>();

  return (appId?: UniqueIdentifier) => {
    const key = appId ?? "dashboard";

    if (clientMap.has(key)) {
      return clientMap.get(key) as ScuteClient;
    }

    const scuteClient = createServerComponentClient(
      { cookies },
      {
        // defaults
        ...{},
        appId,
      }
    );

    //@ts-ignore
    scuteClient.wretcher._middlewares.push((next) => (url, opts) => {
      // disable nextjs cache
      (opts as RequestInit).cache = "no-store";

      return next(url, opts);
    });

    clientMap.set(key, scuteClient);

    return scuteClient;
  };
})();

export const getInternalApiClient = async (appId?: UniqueIdentifier) => {
  const scuteClient = getScuteClient(appId);

  const { data: auth } = await scuteClient.getAuthToken();
  //@ts-ignore
  const secretKey = scuteClient.admin.secretKey;

  let headers: HeadersInit = {};
  if (auth?.access) {
    headers = { ...headers, ...accessTokenHeader(auth.access) };
  }
  if (secretKey) {
    headers = { ...headers, Authorization: `Bearer ${secretKey}` };
  }

  const api = wretch(baseUrl, {
    // disable nextjs cache
    cache: "no-store",
  } as Partial<RequestInit>)
    .headers(headers)
    .resolve((resolver) => resolver.json());

  return { api, scuteClient };
};

export const getCurrentUser = async (): Promise<ScuteUserData | null> => {
  const scuteClient = getScuteClient();

  const { data } = await scuteClient.getUser();
  return data.user;
};
