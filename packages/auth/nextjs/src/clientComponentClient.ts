import {
  AUTH_CHANGE_EVENTS,
  ScuteBrowserCookieStorage,
  UnknownSignInError,
  type ScuteTokenPayload,
  type AuthenticatedSession,
  ScuteClient,
} from "@scute/js-core";
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
      // patch `signInWithTokenPayload`
      // wait for the next api route / route handler to respond
      async function signInWithTokenPayload(
        this: ScuteClient,
        payload: ScuteTokenPayload
      ) {
        const res = await fetchWithCsrf(
          SIGN_IN_HANDLER,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${payload.access}`,
            },
          },
          config?.handlersPrefix
        );

        if (!res.ok) {
          // something went wrong
          await this.removeSession();
          return { error: new UnknownSignInError() };
        } else {
          const session =
            (await this.initialSessionState()) as AuthenticatedSession;

          return await this._signInWithCheck(session);
        }
      }

      scute["signInWithTokenPayload"] = signInWithTokenPayload.bind(scute);

      const handlersPrefix = config?.handlersPrefix;
      scute.onAuthStateChange(async (event) => {
        switch (event) {
          case AUTH_CHANGE_EVENTS.SESSION_EXPIRED:
          case AUTH_CHANGE_EVENTS.SIGNED_OUT:
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
