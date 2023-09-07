import { Text, Container, Grid } from "@radix-ui/themes";
import { Layout } from "@/components/shared/Layout";

export default function Customize() {
  return (
    <Layout>
      <Container size="3">
        <Grid columns={{ initial: "1", md: "2" }} gap="5" width="auto">
          Customize
        </Grid>
      </Container>
    </Layout>
  );
}
