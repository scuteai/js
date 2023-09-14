import {
  createClient,
  isBrowser,
  type UniqueIdentifier,
  type ScuteClientConfig,
  type ScuteClientPreferences,
  ScuteError,
} from "@scute/core";
import { Prettify } from "./utils";

export type ScuteNextjsClientConfig = Prettify<
  Omit<ScuteClientConfig, "appId" | "preferences"> & {
    appId?: UniqueIdentifier;
  } & {
    preferences?: Prettify<
      Omit<ScuteClientPreferences, "persistSession"> & {
        httpOnlyRefresh?: boolean;
      }
    >;
  }
>;

export const createScuteClient = (config: ScuteNextjsClientConfig) => {
  const browser = isBrowser();

  const appId = config?.appId ?? process.env.NEXT_PUBLIC_SCUTE_APP_ID;
  const baseUrl = config?.baseUrl ?? process.env.NEXT_PUBLIC_SCUTE_BASE_URL;
  const secretKey = !browser
    ? config.secretKey ?? process.env.SCUTE_SECRET
    : undefined;

  if (!appId) {
    throw new ScuteError({
      message: "either NEXT_PUBLIC_SCUTE_APP_ID or appId is required!",
    });
  }

  const scuteClient = createClient({
    ...config,
    appId,
    baseUrl,
    secretKey,
    preferences: {
      ...config.preferences,
      persistSession: true,
    },
  });

  [scuteClient["wretcher"], scuteClient.admin["wretcher"]].forEach(
    (wretcher) => {
      wretcher._middlewares.push((next) => (url, opts) => {
        // disable nextjs cache
        (opts as RequestInit).cache = "no-store";

        return next(url, opts);
      });
    }
  );

  return scuteClient;
};
