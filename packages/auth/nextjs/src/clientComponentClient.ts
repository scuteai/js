import { ScuteBrowserCookieStorage } from "@scute/core";
import { getRefreshHandlerPath } from "./handlers";
import { createScuteClient, type ScuteNextjsClientConfig } from "./shared";

let scute: ReturnType<typeof createScuteClient>;

export const createClientComponentClient = (
  config?: ScuteNextjsClientConfig & {
    handlersPrefix?: string;
  }
) => {
  const createNewClient = () => {
    const scute = createScuteClient({
      ...config,
      preferences: {
        ...config?.preferences,
        sessionStorageAdapter: new ScuteBrowserCookieStorage({
          secure: process.env.NODE_ENV === "production",
        }),
      },
    });

    scute.setRefreshProxyCallback(async () => {
      // TODO
      try {
        (
          await fetch(getRefreshHandlerPath(config?.handlersPrefix), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            // body: JSON.stringify({
            //   csrfToken,
            // }),
          })
        ).json();
      } catch {}
    });

    return scute;
  };

  const _scute = scute ?? createNewClient();

  // SSG and SSR
  if (typeof window === "undefined") return _scute;

  // Browser
  if (!scute) scute = _scute;

  return scute;
};
