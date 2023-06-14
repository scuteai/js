import React from "react";
import useIsAuthenticated from "../scute/hooks/useIsAuthenticated";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { invalidateAllQueries } from "../service";

// TODO: Move this into the package

export const ScuteNextProtected = ({ children }: any) => {
  const isAuth = useIsAuthenticated()();
  const router = useRouter();

  useEffect(() => {
    console.log("--- isAUTH: ", isAuth);
    if (!isAuth) {
      invalidateAllQueries();
      router.replace("/"); // todo: this should be the login url coming from server
    }
  }, [isAuth]);

  return <>{children}</>;
};
