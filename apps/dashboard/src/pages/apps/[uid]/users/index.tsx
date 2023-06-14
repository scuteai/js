import { AppLayout } from "@/components/shared/AppLayout";
import { AppSidebar } from "@/components/shared/AppSidebar";
import { ScuteApp, ScuteUser } from "@/types";
import { PlusIcon } from "@radix-ui/react-icons";
import { UserRow } from "@/components/users/UserRow";
import { TableHeader, TableContent } from "@/components/shared/InfoGroup";
import {
  Content,
  Wrapper,
  Container,
  Grid,
  Flex,
  Heading,
  Button,
  Label,
  Card,
  TextField,
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@scute/ui";

const app: ScuteApp = {
  id: "s3414dfa1",
  name: "Example app",
  slug: "example",
  url: "example.scute.io",
};

const appUser: ScuteUser = {
  id: "fadfad41",
  email: "imitkit@gmail.com",
  username: "umitkit",
};

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
                  <NewUserModal />
                </Flex>
              </Flex>
              <TableHeader>
                <Grid columns={5}>
                  <Flex>User</Flex>
                  <Flex>ID</Flex>
                  <Flex>Sign up</Flex>
                  <Flex>Last login</Flex>
                  <Flex>Status</Flex>
                </Grid>
              </TableHeader>
              <TableContent>
                <UserRow user={appUser} />
                <UserRow user={appUser} />
                <UserRow user={appUser} />
                <UserRow user={appUser} />
              </TableContent>
            </Card>
          </Container>
        </Content>
      </Wrapper>
    </AppLayout>
  );
}

const NewUserModal = () => {
  return (
    <Dialog>
      <DialogTrigger asChild={true}>
        <Button variant="primary">
          <PlusIcon /> New User
        </Button>
      </DialogTrigger>
      {/* @ts-ignore */}
      <DialogContent title="Create new user">
        <Flex css={{ fd: "column", gap: "$4" }}>
          <Label>
            Email address
            <Flex css={{ pt: "$1", width: "100%" }}>
              <TextField size="3" css={{ width: "100%" }} />
            </Flex>
          </Label>
          <Label>
            Full name
            <Flex css={{ pt: "$1", width: "100%" }}>
              <TextField size="3" css={{ width: "100%" }} />
            </Flex>
          </Label>
          <Label>
            Phone number
            <Flex css={{ pt: "$1", width: "100%" }}>
              <TextField size="3" css={{ width: "100%" }} />
            </Flex>
          </Label>
          <Button variant="primary" size="3">
            Create
          </Button>
        </Flex>
      </DialogContent>
    </Dialog>
  );
};
