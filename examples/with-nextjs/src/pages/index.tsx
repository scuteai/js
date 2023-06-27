import { useEffect } from "react";
import { useRouter } from "next/router";
import { Auth } from "@scute/ui-react";
import { useAuth, useScuteClient } from "@scute/nextjs";

export default function Home() {
  const router = useRouter();
  const scute = useScuteClient();
  const { session } = useAuth();

  useEffect(() => {
    if (session.status === "authenticated") {
      router.push("/authenticated");
    }
  }, [session, router]);

  if (session.status === "loading") {
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
      <Auth
        scuteClient={scute}
        // onSignIn={() => {
        //   router.push("/authenticated");
        // }}
      />
    </div>
  );
}
