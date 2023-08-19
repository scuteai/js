"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useScuteClient } from "@scute/react";
import { Auth as ScuteAuth } from "@scute/ui-react";

const Auth = () => {
  const router = useRouter();
  const scute = useScuteClient();
  const { session, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/app-router/authenticated");
    }
  }, [router, isAuthenticated]);

  if (isLoading || isAuthenticated) {
    return null;
  }

  return <ScuteAuth scuteClient={scute} />;
};

export default Auth;
