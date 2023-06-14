import React from "react";
import useIsAuthenticated from "./hooks/useIsAuthenticated";
import { useEffect } from "react";
import { useRouter } from "next/router";

export const ProtectedNextRouter = ({ children }: any) => {
  const isAuth = useIsAuthenticated()();
  const router = useRouter();

  useEffect(() => {
    console.log("--- isAUTH: ", isAuth);
    if (isAuth) {
      router.push("/apps");
    }
  }, [isAuth]);

  return <>{children}</>;
};
