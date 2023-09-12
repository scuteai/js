import { getApps } from "@/api";
import { Flex, Container } from "@radix-ui/themes";
import { AppCard } from "@/components/apps/AppCard";

export default async function Apps() {
  // TODO: error handling
  const data = await getApps();

  return (
    <Container size="3">
      <Flex direction="column" gap="2">
        {data?.apps.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </Flex>
    </Container>
  );
}
