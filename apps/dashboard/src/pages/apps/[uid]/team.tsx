import { AppLayout } from "@/components/shared/AppLayout";
import { AppSidebar } from "@/components/shared/AppSidebar";
import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import { TableHeader, TableContent } from "@/components/shared/InfoGroup";
import { RowHolder } from "@/components/users/UserRow";
import {
  Content,
  Wrapper,
  Container,
  Grid,
  Flex,
  Heading,
  Card,
  TextField,
  Badge,
  IconButton,
  Avatar,
} from "@scute/ui";

export default function AppSingleUsers() {
  return (
    <AppLayout>
      <Wrapper>
        <AppSidebar />
        <Content>
          <Container>
            <Card>
              <Flex css={{ jc: "space-between", ai: "center", pb: "$6" }}>
                <Heading size="1">Users</Heading>
                <Flex css={{ gap: "$2" }}>
                  <TextField size="2" placeholder="Search for a user" />
                </Flex>
              </Flex>
              <TableHeader>
                <Grid columns={2}>
                  <Flex>User</Flex>
                  <Flex>Permission</Flex>
                </Grid>
              </TableHeader>
              <TableContent>
                <TeamMemberRow />
                <TeamMemberRow />
                <TeamMemberRow />
                <TeamMemberRow />
              </TableContent>
            </Card>
          </Container>
        </Content>
      </Wrapper>
    </AppLayout>
  );
}

export const TeamMemberRow = () => {
  return (
    <RowHolder columns={2}>
      <Flex css={{ gap: "$2", ai: "center", color: "$gray12" }}>
        <Avatar fallback="UK" size="2" shape="square" />
        umitkit
      </Flex>
      <Flex css={{ ai: "center", gap: "$1", jc: "space-between" }}>
        <Badge variant="red" css={{ gap: "$1", ai: "center" }} size="0">
          Admin
        </Badge>
        <IconButton>
          <DotsHorizontalIcon />
        </IconButton>
      </Flex>
    </RowHolder>
  );
};
