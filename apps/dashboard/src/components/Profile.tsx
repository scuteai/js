"use client";

import { useScuteClient } from "@scute/react";
import { Profile as ScuteProfile, type ProfileProps } from "@scute/ui-react";

export default function Profile(props: Omit<ProfileProps, "scuteClient">) {
  const scuteClient = useScuteClient();
  return <ScuteProfile {...props} scuteClient={scuteClient} />;
}