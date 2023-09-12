import { getApp } from "@/api";
import type { UniqueIdentifier } from "@/types";

import { Flex, Container, Card, Grid } from "@radix-ui/themes";
import { MultipleStats, StatItem } from "@/components/apps/Stats";
import { AppInfoColumns } from "@/components/apps/AppInfoColumns";

export default async function AppSingle({
  params,
}: {
  params: { appId: UniqueIdentifier };
}) {
  const appData = await getApp(params.appId);
  if (!appData) {
    // TODO: error handling
    throw new Error("App Not Found");
  }

  return (
    <Container size="3">
      <Flex gap="4" direction={"column"}>
        <AppInfoColumns appData={appData} />
        <MultipleStats />
        <Card>Activity chart</Card>
        <Card>
          <Grid columns={{ initial: "1", md: "2" }} gap="5" width="auto">
            <Flex>
              <StatItem title="Passkeys" value="55.6%" />
            </Flex>
            <Flex>
              <StatItem title="Magic links" value="25.6%" />
            </Flex>
          </Grid>
        </Card>
      </Flex>
    </Container>
  );
}
