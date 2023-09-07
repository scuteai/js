import '@radix-ui/themes/styles.css';
import '@/styles/globals.scss'
import type { AppProps } from 'next/app'
import { Theme } from '@radix-ui/themes';
import React, { useState } from "react";
import { createPagesBrowserClient } from "@scute/nextjs";
import { AuthContextProvider } from "@scute/react";
export default function App({ Component, pageProps }: AppProps) {
  const [scuteClient] = useState(() =>
  createPagesBrowserClient({
    appId: process.env.NEXT_PUBLIC_SCUTE_APP_ID as string,
    baseUrl: process.env.NEXT_PUBLIC_SCUTE_BASE_URL as string,
  })
);
  return ( <AuthContextProvider scuteClient={scuteClient}><Theme accentColor="teal" grayColor="mauve" scaling='110%'><Component {...pageProps} /></Theme></AuthContextProvider>)
}
