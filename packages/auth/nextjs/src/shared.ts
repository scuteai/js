import {
  createClient,
  isBrowser,
  type ScuteClientConfig,
  type ScuteClientPreferences,
} from "@scute/core";

export type ScuteNextjsClientConfig = Omit<ScuteClientConfig, "preferences"> & {
  preferences?: Omit<
    ScuteClientPreferences,
    "autoRefreshToken" | "persistSession"
  >;
};

export const createScuteClient = (config: ScuteNextjsClientConfig) => {
  const browser = isBrowser();

  return createClient({
    ...config,
    preferences: {
      ...config.preferences,
      autoRefreshToken: browser,
      detectSessionInUrl:
        browser && config.preferences?.detectSessionInUrl !== false,
      persistSession: true,
    },
  });
};
