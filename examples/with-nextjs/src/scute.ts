import { createClient } from "@scute/auth-react";

export const scuteClient = createClient(
  {
    appId: process.env.NEXT_PUBLIC_SCUTE_APP_ID as string,
    appDomain: process.env.NEXT_PUBLIC_SCUTE_APP_DOMAIN as string,
    baseUrl: process.env.NEXT_PUBLIC_SCUTE_BASE_URL as string,
  },
  {
    webauthn: "optional"
  }
);