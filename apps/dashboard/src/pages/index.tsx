import { useEffect } from "react";
import { CenterContent } from "@scute/ui";
import { Auth, darkTheme } from "@scute/ui-react";
import { useRouter } from "next/router";
import { useAuth, useScuteClient } from "@scute/nextjs";

export default function Home() {
  const router = useRouter();
  const scuteClient = useScuteClient();
  const { session } = useAuth();

  useEffect(() => {
    if (session.status === "authenticated") {
      router.push("/apps");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status]);

  if (session.status === "loading") {
    return null;
  }

  return (
    <CenterContent>
      <Auth
        scuteClient={scuteClient}
        appearance={{
          //theme: darkTheme,
        }}
      />
    </CenterContent>
  );
}
