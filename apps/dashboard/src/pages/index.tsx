
import {
  Flex,
  Text,
  Button,
  Container,
  Inset,
  Card,
  Box,
} from "@radix-ui/themes";
import { Auth } from "@scute/ui-react";
import { useRouter } from "next/router";
import { useAuth, useScuteClient } from "@scute/react";
import { useEffect } from "react";
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
    <div>
      <Container size="3">
        <Flex align='center' justify='center' style={{height:'100vh'}}>
      <Auth scuteClient={scuteClient} />
      </Flex>
      </Container>
    </div>
  );
}
