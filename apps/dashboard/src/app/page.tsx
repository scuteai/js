"use client";

import { Flex, Container } from "@radix-ui/themes";
import { Auth } from "@scute/ui-react";
import { useAuth, useScuteClient } from "@scute/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const scuteClient = useScuteClient();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/apps");
    }
  }, [isAuthenticated]);

  return (
    <div>
      <Container size="3">
        <Flex align="center" justify="center" style={{ height: "100vh" }}>
          <Auth scuteClient={scuteClient} />
        </Flex>
      </Container>
    </div>
  );
}
