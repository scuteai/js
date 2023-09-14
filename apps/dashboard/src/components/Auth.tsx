"use client";
import { useRouter } from "next/navigation";
import { useScuteClient } from "@scute/react";
import { Auth as ScuteAuth, type AuthProps } from "@scute/ui-react";
import { PATHS } from "@/app/routes";

export default function Auth(props: Omit<AuthProps, "scuteClient">) {
  const router = useRouter();
  const scuteClient = useScuteClient();

  return (
    <ScuteAuth
      {...props}
      scuteClient={scuteClient}
      onSignIn={() => {
        router.push(PATHS.APPS);
      }}
    />
  );
}
