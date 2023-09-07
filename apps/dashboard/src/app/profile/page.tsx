"use client";

import { Container } from "@radix-ui/themes";
import { Profile, darkTheme } from "@scute/ui-react";
import { useScuteClient } from "@scute/react";

export default function AppProfile() {
  const scuteClient = useScuteClient();

  return (
    <Container size="3">
      <Profile
        scuteClient={scuteClient}
        appearance={
          {
            //theme: darkTheme,
          }
        }
      />
    </Container>
  );
}
