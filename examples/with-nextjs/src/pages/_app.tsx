import type { AppProps } from "next/app";
import { createPagesBrowserClient } from "@scute/nextjs";
import { AuthContextProvider } from "@scute/react";
import { darkTheme, ThemeProvider as ScuteThemeProvider } from "@scute/ui-react";

export default function App({ Component, pageProps }: AppProps) {
  const scute = createPagesBrowserClient();

  return (
    <AuthContextProvider scuteClient={scute}>
      <ScuteThemeProvider theme={{}} /* theme={darkTheme} */>
        <Component {...pageProps} />
      </ScuteThemeProvider>
    </AuthContextProvider>
  );
}
