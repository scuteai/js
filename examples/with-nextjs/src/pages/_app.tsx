import type { AppProps } from "next/app";
import { createPagesBrowserClient } from "@scute/nextjs";
import { AuthContextProvider } from "@scute/react";

export default function App({ Component, pageProps }: AppProps) {
  const scute = createPagesBrowserClient();

  return (
    <AuthContextProvider scuteClient={scute}>
      <Component {...pageProps} />
    </AuthContextProvider>
  );
}
