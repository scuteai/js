import {
  Content,
  Sidebar,
  Wrapper,
  Container,
  Grid,
  Flex,
  Heading,
  Card,
  Accordion,
} from "@scute/ui";
import { AppLayout } from "@/components/shared/AppLayout";
import { AppSidebar } from "@/components/shared/AppSidebar";
import {  ScuteApp } from "@/types";
import { ActivityRow } from "@/components/activity/ActivityRow";
import { TableHeader, TableContent } from "@/components/shared/InfoGroup";

// TODO
import type { ScuteActivity } from "@scute/auth-core";

const app: ScuteApp = {
  id: "s3414dfa1",
  name: "Example app",
  slug: "example",
  url: "example.scute.io",
};

const activities: ScuteActivity[] = [
  {
    id: "4345tsdfdsfe",
    email: "imitkit@gmail.com",
    user_id: "fdaf1443r",
    event_type: "webauthn.login.initiated",
    timestamp: "5 days ago",
    ip_address: "2600:4040:92bc:3d00:ec7b:8472:a149:6af5",
    user_agent: "Chrome (v105.0.0.0) on Mac OSX (v10.15.7)",
  },
  {
    id: "4345tsdfdsfe",
    email: "imitkit@gmail.com",
    user_id: "fdaf1443r",
    event_type: "webauthn.login.initiated",
    timestamp: "5 days ago",
    ip_address: "2600:4040:92bc:3d00:ec7b:8472:a149:6af5",
    user_agent: "Chrome (v105.0.0.0) on Mac OSX (v10.15.7)",
  },
  {
    id: "4345tsdfdsfe",
    email: "imitkit@gmail.com",
    user_id: "fdaf1443r",
    event_type: "webauthn.login.initiated",
    timestamp: "5 days ago",
    ip_address: "2600:4040:92bc:3d00:ec7b:8472:a149:6af5",
    user_agent: "Chrome (v105.0.0.0) on Mac OSX (v10.15.7)",
  },
];

export default function AppSingleUsers() {
  return (
    <AppLayout>
      <Wrapper>
        <AppSidebar />
        <Content>
          <Container>
            <Card>
              <Flex css={{ jc: "space-between", ai: "center", pb: "$6" }}>
                <Heading size="1">Activity</Heading>
                <Flex css={{ gap: "$2" }}>{/* <NewUserModal /> */}</Flex>
              </Flex>
              <TableHeader>
                <Grid columns={4}>
                  <Flex>User</Flex>
                  <Flex>ID</Flex>
                  <Flex>Event type</Flex>
                  <Flex>Timestamp</Flex>
                </Grid>
              </TableHeader>

              <TableContent>
                <Accordion type="multiple">
                  {activities.map((activity, index) => (
                    <ActivityRow
                      activity={activity}
                      value={`s-${index}`}
                      key={index}
                    />
                  ))}
                </Accordion>
              </TableContent>
            </Card>
          </Container>
        </Content>
      </Wrapper>
    </AppLayout>
  );
}
