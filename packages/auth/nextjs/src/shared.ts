import {
  isBrowser,
  type UniqueIdentifier,
  type ScuteClientConfig,
  type ScuteClientPreferences,
  ScuteError,
  ScuteClient,
} from "@scute/js-core";
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

export const createScuteClient = (
  config: ScuteNextjsClientConfig,
  onBeforeInitialize?: (this: PScuteClient) => void
) => {
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

  const scuteClient = new PScuteClient(
    {
      ...config,
      appId,
      baseUrl,
      secretKey,
      preferences: {
        ...config.preferences,
        persistSession: true,
      },
    },
    onBeforeInitialize
  ) as ScuteClient;

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

class PScuteClient extends ScuteClient {
  protected onBeforeInitialize?: (this: PScuteClient) => void;
  constructor(
    config: ScuteClientConfig,
    onBeforeInitialize?: (this: PScuteClient) => void
  ) {
    super(config);
    this.onBeforeInitialize = onBeforeInitialize;
  }

  protected async _initialize(): Promise<{ error: ScuteError | null }> {
    this.onBeforeInitialize?.();
    return super._initialize();
  }
}
