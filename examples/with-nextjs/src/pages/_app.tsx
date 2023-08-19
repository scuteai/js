import type { AppProps } from "next/app";
import { createPagesBrowserClient } from "@scute/nextjs";
import { AuthContextProvider } from "@scute/react";
import { darkTheme, ThemeProvider } from "@scute/ui-react";

export default function App({ Component, pageProps }: AppProps) {
  const scute = createPagesBrowserClient();

  return (
    <AuthContextProvider scuteClient={scute}>
      <ThemeProvider theme={{}} /* theme={darkTheme} */>
        <Component {...pageProps} />
      </ThemeProvider>
    </AuthContextProvider>
  );
}
