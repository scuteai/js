import { Content, Container, Grid } from "@scute/ui";
import { AppLayout } from "@/components/shared/AppLayout";
import { ProfileElement } from "../scute/ProfileElement";

export default function Profile() {
  return (
    <AppLayout>
      <Content css={{ py: "$6" }}>
        <Container size="3">
          <ProfileElement />
        </Container>
      </Content>
    </AppLayout>
  );
}
