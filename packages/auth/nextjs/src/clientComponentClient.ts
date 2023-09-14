import {
  ScuteBrowserCookieStorage,
  UnknownSignInError,
  type ScuteTokenPayload,
} from "@scute/core";
import {
  fetchWithCsrf,
  REFRESH_HANDLER,
  SIGN_IN_HANDLER,
  SIGN_OUT_HANDLER,
} from "./handler";
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

    if (typeof window === "undefined") {
      // non browser, so prevent initializing browser only
      // callbacks
      return scute;
    }

    if (config?.preferences?.httpOnlyRefresh !== false) {
      const originalSignInWithTokenPayload = scute["signInWithTokenPayload"];

      const signInWithTokenPayload = async (payload: ScuteTokenPayload) => {
        const res = await fetchWithCsrf(
          SIGN_IN_HANDLER,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${payload.access}`,
            },
          },
          handlersPrefix
        );
        if (!res.ok) {
          // something went wrong
          await scute.signOut();
          return { error: new UnknownSignInError() };
        } else {
          const { access} = await scute[
            "initialSessionState"
          ]();

          return originalSignInWithTokenPayload.bind(scute)({
            access,
          } as any);
        }
      };

      scute["signInWithTokenPayload"] = async (payload) => {
        return signInWithTokenPayload(payload);
      };

      const handlersPrefix = config?.handlersPrefix;
      scute.onAuthStateChange(async (event) => {
        switch (event) {
          case "session_expired":
          case "signed_out":
            await fetchWithCsrf(
              SIGN_OUT_HANDLER,
              {
                method: "POST",
              },
              handlersPrefix
            );
            break;

          default:
            break;
        }
      });

      scute.setRefreshProxyCallback(async () => {
        const refreshFetch = await fetchWithCsrf(
          REFRESH_HANDLER,
          {
            method: "POST",
          },
          handlersPrefix
        );

        if (refreshFetch.ok) {
          return refreshFetch.json();
        }
      });
    }

    return scute;
  };

  const _scute = scute ?? createNewClient();

  // SSG and SSR
  if (typeof window === "undefined") return _scute;

  // Browser
  if (!scute) scute = _scute;

  return scute;
};
