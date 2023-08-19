"use client";
import { AuthContextProvider } from "@scute/react";
import { createClientComponentClient } from "@scute/nextjs";

const Providers = ({ children }: { children: React.ReactNode }) => {
  return <AuthProvider>{children}</AuthProvider>;
};

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const scute = createClientComponentClient({
    handlersPrefix: "app-router"
  });

  return (
    <AuthContextProvider scuteClient={scute}>{children}</AuthContextProvider>
  );
};

export default Providers;
