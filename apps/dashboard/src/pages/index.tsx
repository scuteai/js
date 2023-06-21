import { useEffect } from "react";
import { CenterContent } from "@scute/ui";
import { Auth } from "@scute/auth-ui-react";
import { useRouter } from "next/router";
import { scuteClient } from "@/scute";
import { useAuth } from "@scute/auth-react";

export default function Home() {
  const router = useRouter();
  const { session } = useAuth();

  useEffect(() => {
    if (session.status === "authenticated") {
      router.push("/apps");
    }
  }, [session.status]);

  if (session.status === "loading") {
    return null;
  }

  return (
    <CenterContent>
      <Auth
        scuteClient={scuteClient}
        // onSignIn={() => {
        //   router.push("/authenticated");
        // }}
      />
    </CenterContent>
  );
}
