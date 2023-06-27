import { Content, Container } from "@scute/ui";
import { AppLayout } from "@/components/shared/AppLayout";
import { darkTheme, Profile } from "@scute/ui-react";
import { useScuteClient } from "@scute/nextjs";

export default function ProfilePage() {
  const scuteClient = useScuteClient();

  return (
    <AppLayout>
      <Content css={{ py: "$6" }}>
        <Container size="3">
          <Profile
            scuteClient={scuteClient}
            appearance={{
              //theme: darkTheme,
            }}
          />
        </Container>
      </Content>
    </AppLayout>
  );
}
