import { Container, Grid } from "@radix-ui/themes";

export default function EmailSettings() {
  return (
    <Container size="3">
      <Grid columns={{ initial: "1", md: "2" }} gap="5" width="auto">
        email
      </Grid>
    </Container>
  );
}
