import {
  Content,
  Container,
  Wrapper,
  Grid,
  Flex,
  Card,
  Heading,
  Text,
  Badge,
  IconButton,
  Button,
} from "@scute/ui";
import { AppLayout } from "@/components/shared/AppLayout";
import { AppSidebar } from "@/components/shared/AppSidebar";
import { ScuteApp } from "@/types";
import { TableHeader, TableContent } from "@/components/shared/InfoGroup";
import { RowHolder } from "@/components/users/UserRow";
import { PlusCircledIcon, TrashIcon } from "@radix-ui/react-icons";

const apps: ScuteApp[] = [
  {
    id: "s3414dfa",
    name: "Scute dashboard",
    slug: "scute-d",
    url: "control.scute.io",
  },
  {
    id: "s3414dfa1",
    name: "Example app",
    slug: "example",
    url: "example.scute.io",
  },
];

export default function AppSingleApiKeys() {
  return (
    <AppLayout>
      <Wrapper>
        <AppSidebar />
        <Content>
          <Container>
            <Card>
              <Flex
                css={{
                  fd: "column",
                  jc: "space-between",
                  ai: "flex-start",
                  pb: "$6",
                }}
              >
                <Heading size="1">API Keys</Heading>

                <Flex css={{ gap: "$2" }}>{/* <NewUserModal /> */}</Flex>
              </Flex>
              <Flex css={{ fd: "column", gap: "$2" }}>
                <Text size="1">
                  Your secret API keys are listed below. Please note that we do
                  not display your secret API keys again after you generate
                  them.
                </Text>
                <Text size="1">
                  Do not share your API key with others, or expose it in the
                  browser or other client-side code. In order to protect the
                  security of your account, OpenAI may also automatically rotate
                  any API key that we&#39;ve found has leaked publicly.
                </Text>
              </Flex>

              <Flex
                css={{
                  maxWidth: "580px",
                  mt: "$6",
                  fd: "column",
                  pb: "$3",
                  borderBottom: "1px solid $colors$gray3",
                  mb: "$3",
                }}
              >
                <TableHeader>
                  <Grid columns={3}>
                    <Flex>Token</Flex>
                    <Flex>Created at</Flex>
                    <Flex>Nickname</Flex>
                  </Grid>
                </TableHeader>

                <TableContent>
                  <RowHolder columns={3}>
                    <Flex css={{ gap: "$2", ai: "center", color: "$gray12" }}>
                      <Badge variant="green" size="1">
                        SC-.....-134tfd
                      </Badge>
                    </Flex>
                    <Flex>Sep 24, 2022</Flex>
                    <Flex css={{ ai: "center", jc: "space-between" }}>
                      Production
                      <IconButton>
                        <TrashIcon />
                      </IconButton>
                    </Flex>
                  </RowHolder>
                </TableContent>
              </Flex>
              <Button>
                <PlusCircledIcon /> Create new token
              </Button>
            </Card>
          </Container>
        </Content>
      </Wrapper>
    </AppLayout>
  );
}
