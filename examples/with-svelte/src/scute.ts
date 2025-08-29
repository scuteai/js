import { createClient } from "@scute/js-core";

export const scuteClient = createClient({
  appId: import.meta.env.VITE_SCUTE_APP_ID,
  baseUrl: import.meta.env.VITE_SCUTE_BASE_URL,
});
