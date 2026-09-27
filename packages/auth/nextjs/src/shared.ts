import {
  isBrowser,
  type UniqueIdentifier,
  type ScuteClientConfig,
  type ScuteClientPreferences,
  ScuteError,
  ScuteClient,
} from "@scute/js-core";
import type { Prettify } from "./utils";

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

  const scuteClient = new ScuteClient({
    ...config,
    appId,
    baseUrl,
    secretKey,
    preferences: {
      ...config.preferences,
      persistSession: true,
    },
    // Runs inside the ScuteClient constructor, before its first request
    // (the app-data GET, which carries the secret key).
    onBeforeInitialize(this: ScuteClient) {
      disableNextFetchCache(this);
      config.onBeforeInitialize?.call(this);
    },
  });

  return scuteClient;
};

const disableNextFetchCache = (scuteClient: ScuteClient) => {
  [
    scuteClient["wretcher"],
    scuteClient.admin["wretcher"],
    scuteClient.verifications["wretcher"],
  ].forEach((wretcher) => {
    wretcher._middlewares.push((next) => (url, opts) => {
      // disable nextjs cache
      (opts as RequestInit).cache = "no-store";

      return next(url, opts);
    });
  });
};
