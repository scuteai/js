import {
  Flex,
  Text,
  Button,
  Container,
  Card,
  Code,
  Badge,
  Grid,
  Heading,
  Avatar,
} from "@radix-ui/themes";
import { Layout } from "@/components/shared/Layout";
import { MultipleStats, StatItem } from "@/components/apps/Stats";
import { CopyIcon } from "@radix-ui/react-icons";
import {useRouter} from "next/router";
export default function AppSingle() {
  const router = useRouter();

  const appId = router.query.id


  const AppInfoColumns = () => (
    <Grid columns={{ initial: "1", md: "2" }} gap="5" width="auto">
      <Card>
        <Flex align="center" gap="5">
          <Avatar fallback="R" color="red" size="7" />
          <Flex direction="column" justify="start" align="start">
            <Heading>Test app</Heading> <Text>origin.myapp.com</Text>
            <Badge variant="soft">Active</Badge>
          </Flex>
        </Flex>
      </Card>
      <Card>
        <Flex gap="1" direction="column" gap="3">
          <Flex direction="column" gap="1">
            <Text size="2">App ID:</Text>
            <Flex align="center" justify="between">
              <Code variant="outline" size="1">
                {appId}
              </Code>
              <Button size="1" variant="surface">
                <CopyIcon />
                Copy
              </Button>
            </Flex>
          </Flex>
          <Flex direction="column" gap="1">
            <Text size="2">API Url:</Text>
            <Code variant="ghost" size="1">
              https://api.scute.io/apps/{appId}
            </Code>
          </Flex>
        </Flex>
      </Card>
    </Grid>
  );

  return (
    <Layout>
      <Container size="3">
        <Flex gap="4" direction={"column"}>
          <AppInfoColumns />
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
    </Layout>
  );
}
