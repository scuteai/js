import { createClient } from "@scute/auth-react";

export const scuteClient = createClient(
  {
    appId: "b_9kwgh2c3xmqnu7",
    appDomain: "localhost",
    baseUrl: "http://localhost:3001",
  },
  {
    webauthn: "optional"
  }
);
