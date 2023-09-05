import { useEffect } from "react";
import { CenterContent } from "@scute/ui";
import { Auth } from "@scute/ui-react";
import { useRouter } from "next/router";
import { useAuth, useScuteClient } from "@scute/react";

export default function Home() {
  const router = useRouter();
  const scuteClient = useScuteClient();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/apps");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  return (
    <CenterContent>
      <Auth scuteClient={scuteClient} />
    </CenterContent>
  );
}
