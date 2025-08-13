"use client";
import { type ReactNode } from "react";
import { useState } from "react";
import { createClient } from "@scute/react-hooks";
import { AuthContextProvider } from "@scute/react-hooks";

type ProvidersProps = {
  children: ReactNode;
};

export default function Providers({ children }: ProvidersProps) {
  return <AuthProvider>{children}</AuthProvider>;
}

const scuteClient = createClient({
  appId: import.meta.env.VITE_SCUTE_APP_ID,
  baseUrl: import.meta.env.VITE_SCUTE_BASE_URL,
});

function AuthProvider({ children }: ProvidersProps) {
  return (
    <AuthContextProvider scuteClient={scuteClient}>
      <>{children}</>
    </AuthContextProvider>
  );
}
