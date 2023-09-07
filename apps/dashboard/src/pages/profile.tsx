import { Flex, Container } from "@radix-ui/themes";
import { Layout } from "@/components/shared/Layout";
import { darkTheme, Profile } from "@scute/ui-react";
import { useScuteClient } from "@scute/react";
export default function AppProfile() {
  const scuteClient = useScuteClient();
  return (
    <Layout>
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
    </Layout>
  );
}
