import { useState } from "react";
import type { AppProps } from "next/app";
import { createPagesBrowserClient, AuthContextProvider } from "@scute/nextjs";

export default function App({ Component, pageProps }: AppProps) {
  const [scuteClient] = useState(() =>
    createPagesBrowserClient({
      appId: process.env.NEXT_PUBLIC_SCUTE_APP_ID as string,
      baseUrl: process.env.NEXT_PUBLIC_SCUTE_BASE_URL as string,
    })
  );

  return (
    <AuthContextProvider scuteClient={scuteClient}>
      {/* @ts-ignore */}
      <Component {...pageProps} />
    </AuthContextProvider>
  );
}
