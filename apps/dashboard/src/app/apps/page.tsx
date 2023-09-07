import { Flex, Container } from "@radix-ui/themes";
import { AppCard } from "@/components/apps/AppCard";
import { ScuteApp } from "@/types";

const apps: ScuteApp[] = [
  {
    id: "adfdaf4df-fdafda-4314fadf-4efsdfafa",
    name: "Example app",
    slug: "example-app",
    origin: "https://example.com",
  },
];

export default function Home() {
  return (
    <Container size="3">
      <Flex direction="column" gap="2">
        {apps.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </Flex>
    </Container>
  );
}
