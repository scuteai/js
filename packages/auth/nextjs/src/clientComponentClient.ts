import { ScuteBrowserCookieStorage } from "@scute/react";
import { createScuteClient, type ScuteNextjsClientConfig } from "./shared";

let scute: ReturnType<typeof createScuteClient>;

export const createClientComponentClient = (
  config?: ScuteNextjsClientConfig
) => {
  const appId = config?.appId ?? process.env.NEXT_PUBLIC_SCUTE_APP_ID;
  const baseUrl = config?.baseUrl ?? process.env.NEXT_PUBLIC_SCUTE_BASE_URL;

  if (!appId) {
    throw new Error("either NEXT_PUBLIC_SCUTE_APP_ID or appId is required!");
  }

  const createNewClient = () => {
    return createScuteClient({
      ...config,
      appId,
      baseUrl,
      preferences: {
        ...config?.preferences,
        sessionStorageAdapter: new ScuteBrowserCookieStorage({
          secure: process.env.NODE_ENV === "production",
        }),
      },
    });
  };

  const _scute = scute ?? createNewClient();

  // SSG and SSR
  if (typeof window === "undefined") return _scute;

  // Browser
  if (!scute) scute = _scute;

  return scute;
};
