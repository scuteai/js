import "../styles/globals.scss";
import type { AppProps } from "next/app";
import React from "react";
import Head from "next/head";
import { DesignSystemProvider } from "@scute/ui";
import { globalCss } from "../styles/stitches.config";
import { scuteClient } from "@/scute";
import { AuthContextProvider } from "@scute/auth-react";

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

export default function App({ Component, pageProps }: AppProps) {
  globalStyles();
  return (
    <AuthContextProvider scuteClient={scuteClient}>
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
    </AuthContextProvider>
  );
}
