import { useEffect } from "react";
import { useRouter } from "next/router";
import { Auth } from "@scute/ui-react";
import { useAuth, useScuteClient } from "@scute/react";

export default function Home() {
  const router = useRouter();
  const scute = useScuteClient();
  const { session, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/pages-router/authenticated");
    }
  }, [router, session.status, isAuthenticated]);

  if (isLoading || isAuthenticated) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      <Auth scuteClient={scute} />
    </div>
  );
}
