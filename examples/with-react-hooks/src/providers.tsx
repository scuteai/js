"use client";
import { type ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@scute/react-hooks";
import { AuthContextProvider, useAuth } from "@scute/react-hooks";

type ProvidersProps = {
  children: ReactNode;
};

export default function Providers({ children }: ProvidersProps) {
  return <AuthProvider>{children}</AuthProvider>;
}

function AuthProvider({ children }: ProvidersProps) {
  const [scuteClient] = useState(() =>
    createClient({
      appId: import.meta.env.VITE_SCUTE_APP_ID,
      baseUrl: import.meta.env.VITE_SCUTE_BASE_URL,
    })
  );

  return (
    <AuthContextProvider scuteClient={scuteClient}>
      <ClientAuthGuard>{children}</ClientAuthGuard>
    </AuthContextProvider>
  );
}

const ClientAuthGuard = ({ children }: ProvidersProps) => {
  const { session } = useAuth();

  const guard = useCallback(
    () =>
      location.pathname.startsWith("/profile") &&
      session.status === "unauthenticated",
    [session.status]
  );

  useEffect(() => {
    if (guard()) {
      window.location.href = "/";
    }
  }, [guard]);

  if (guard()) {
    return null;
  }

  return <>{children}</>;
};
