import "../styles/globals.scss";
import type { AppProps } from "next/app";
import React from "react";
import Head from "next/head";
import { DesignSystemProvider } from "@scute/ui";
import { globalCss } from "../styles/stitches.config";
import {
  Hydrate,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { ScuteAuthProvider } from "../scute/ScuteAuthProvider";
import { ScuteNextProtected } from "../utils/ScuteNextProtected";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // globally default to 20 seconds
      staleTime: 1000 * 20,
    },
  },
});

const QueryProvider = (props: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    {props.children}
  </QueryClientProvider>
);

const globalStyles = globalCss({
  "*, *::before, *::after": {
    boxSizing: "border-box",
  },

  body: {
    margin: 0,
    color: "$hiContrast",
    backgroundColor: "$lowContrast",
    fontFamily: "$main",
    fontSize: "$3",
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
    WebkitTextSizeAdjust: "100%",

    ".dark-theme &": {
      backgroundColor: "$mauve1",
    },
  },

  svg: {
    display: "block",
    verticalAlign: "middle",
    overflow: "visible",
  },

  "pre, code": { margin: 0, fontFamily: "$mono" },

  "::selection": {
    backgroundColor: "$cyan5",
    color: "$violet8",
  },

  "#__next": {
    position: "relative",
    zIndex: 0,
    height: "100%",
  },

  "h1, h2, h3, h4, h5": { fontWeight: 500 },
});

const baseUrl = process.env.NEXT_PUBLIC_SCUTE_BASE_URL as string;
const appId = process.env.NEXT_PUBLIC_SCUTE_APP_ID as string;
const domain = process.env.NEXT_PUBLIC_SCUTE_APP_DOMAIN as string;

const middleware = () => {
  console.log("middleweare");
};
export default function App({ Component, pageProps }: any /* AppProps*/) {
  globalStyles();
  return (
    <ScuteAuthProvider
      middleware={middleware}
      domain={domain}
      appId={appId}
      baseUrl={baseUrl}
    >
      <ScuteNextProtected>
        <QueryProvider>
          <DesignSystemProvider>
            <div style={{ height: "100%" }}>
              <Head>
                <title>Scute</title>
                <meta
                  name="viewport"
                  content="width=device-width, initial-scale=1.0"
                />
              </Head>
              <Component {...pageProps} />
            </div>
          </DesignSystemProvider>
        </QueryProvider>
      </ScuteNextProtected>
    </ScuteAuthProvider>
  );
}
