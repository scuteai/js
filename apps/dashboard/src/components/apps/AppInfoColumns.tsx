import type { ScuteAppData } from "@/types";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Code,
  Flex,
  Grid,
  Heading,
  Text,
} from "@radix-ui/themes";
import { CopyIcon } from "@radix-ui/react-icons";

export const AppInfoColumns = ({ appData }: { appData: ScuteAppData }) => (
  <Grid columns={{ initial: "1", md: "2" }} gap="5" width="auto">
    <Card>
      <Flex align="center" gap="5">
        <Avatar
          src={appData.logo}
          fallback={appData.name.charAt(0)}
          color="red"
          size="7"
        />
        <Flex direction="column" justify="start" align="start">
          <Heading>{appData.name}</Heading> <Text>{appData.origin}</Text>
          <Badge variant="soft">Active</Badge>
        </Flex>
      </Flex>
    </Card>
    <Card>
      <Flex direction="column" gap="3">
        <Flex direction="column" gap="1">
          <Text size="2">App ID:</Text>
          <Flex align="center" justify="between">
            <Code variant="outline" size="1">
              {appData.id}
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
            https://api.scute.io/apps/{appData.id}
          </Code>
        </Flex>
      </Flex>
    </Card>
  </Grid>
);
