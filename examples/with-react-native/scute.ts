import { createClient } from "@scute/react-hooks";

export const scuteClient = createClient({
  appId: process.env.EXPO_PUBLIC_SCUTE_APP_ID!,
  baseUrl: process.env.EXPO_PUBLIC_SCUTE_BASE_URL!,
});
