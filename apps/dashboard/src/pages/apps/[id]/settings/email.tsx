import { Text, Container, Grid } from "@radix-ui/themes";
import { Layout } from "@/components/shared/Layout";

export default function EmailSettings() {
  return (
    <Layout>
      <Container size="3">
        <Grid columns={{ initial: "1", md: "2" }} gap="5" width="auto">
          email
        </Grid>
      </Container>
    </Layout>
  );
}
