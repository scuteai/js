import { createClient } from "@scute/vue";

export const scute = createClient({
  appId: import.meta.env.VITE_SCUTE_APP_ID as string,
  baseUrl: import.meta.env.VITE_SCUTE_BASE_URL as string,
});