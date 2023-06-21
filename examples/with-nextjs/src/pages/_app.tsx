import { scuteClient } from "@/scute";
import { AuthContextProvider } from "@scute/auth-react";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthContextProvider scuteClient={scuteClient}>
      <Component {...pageProps} />
    </AuthContextProvider>
  );
}
