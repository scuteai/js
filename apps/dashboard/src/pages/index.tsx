import { CenterContent } from "@scute/ui";
import { useEffect } from "react";
import { useRouter } from "next/router";
import useIsAuthenticated from "../scute/hooks/useIsAuthenticated";
import { LoginElement } from "../scute/LoginElement";

export default function Home() {
  const isAuth = useIsAuthenticated()();
  const router = useRouter();

  useEffect(() => {
    console.log("--- isAUTH: ", isAuth);
    if (isAuth) {
      router.push("/apps");
    }
  }, [isAuth]);

  return (
    <CenterContent>
      <LoginElement />
    </CenterContent>
  );
}
