import { useEffect } from "react";
import { CenterContent } from "@scute/ui";
import { Auth } from "@scute/ui-react";
import { useRouter } from "next/router";
import { useAuth, useScuteClient } from "@scute/nextjs";

export default function Home() {
  const router = useRouter();
  const scuteClient = useScuteClient();
  const { isAuthenticated, isLoading, session, user } = useAuth();

  useEffect(() => {
    scuteClient.onAuthStateChange((event, session, user) => {});
    if (isAuthenticated) {
      router.push("/apps");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (isAuthenticated || isLoading) {
    return null;
  }

  return (
    <CenterContent>
      <Auth scuteClient={scuteClient} />
    </CenterContent>
  );
}
