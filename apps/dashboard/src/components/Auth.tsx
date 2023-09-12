"use client";

import { useScuteClient } from "@scute/react";
import { Auth as ScuteAuth } from "@scute/ui-react";

export default function Auth() {
  const scuteClient = useScuteClient();
  return <ScuteAuth scuteClient={scuteClient} />;
}
