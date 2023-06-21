import { AppLayout } from "@/components/shared/AppLayout";
import { AppSidebar } from "@/components/shared/AppSidebar";
import { ScuteApp } from "@/types";
import {
  ChevronLeftIcon,
  TrashIcon,
  SewingPinFilledIcon,
} from "@radix-ui/react-icons";
import { CodeSnippet } from "@/components/shared/CodeSnippet";
import {
  InfoGroup,
  InfoGroupContent,
  InfoGroupTitle,
} from "@/components/shared/InfoGroup";

import {
  Content,
  Wrapper,
  Container,
  Grid,
  Flex,
  Button,
  Badge,
  Avatar,
  Text,
} from "@scute/ui";

// TODO
import type { ScuteUser } from "@scute/auth-core";

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
            <Flex css={{ ai: "center", fontSize: "$1", pb: "$2" }}>
              <ChevronLeftIcon /> Back to all users
            </Flex>
            <header>
              <Flex css={{ jc: "space-between", ai: "center", pb: "$6" }}>
                <Flex css={{ ai: "center", gap: "$3" }}>
                  <Avatar fallback="UK" size="3" shape="square" />
                  <Text size="5">Umit Kitapcigil</Text>
                </Flex>
                <Flex>
                  <Button variant="destructive" size="0">
                    Delete user <TrashIcon />
                  </Button>
                </Flex>
              </Flex>
            </header>
            <Text css={{ color: "$gray8" }} size="1">
              View user information
            </Text>
            <Grid
              columns={2}
              gap={6}
              css={{ pt: "$4", mt: "$3", borderTop: "1px solid $colors$gray3" }}
            >
              <Flex css={{ gap: "$6", fd: "column" }}>
                <InfoGroup>
                  <InfoGroupTitle>Full name</InfoGroupTitle>
                  <InfoGroupContent>Umit Kitapcigil</InfoGroupContent>
                </InfoGroup>

                <InfoGroup>
                  <InfoGroupTitle>User ID</InfoGroupTitle>
                  <InfoGroupContent>
                    <Badge>fadfefadfear13413431f4rjwi9tj240jwor</Badge>
                  </InfoGroupContent>
                </InfoGroup>

                <InfoGroup>
                  <InfoGroupTitle>Email</InfoGroupTitle>
                  <InfoGroupContent>imitkit@gmail.com</InfoGroupContent>
                </InfoGroup>

                <InfoGroup>
                  <InfoGroupTitle>Phone</InfoGroupTitle>
                  <InfoGroupContent>+1 917 254 70 61</InfoGroupContent>
                </InfoGroup>

                <InfoGroup>
                  <InfoGroupTitle>Joined in</InfoGroupTitle>
                  <InfoGroupContent>
                    2022/2/5 09:17:25,{" "}
                    <Flex css={{ ai: "center" }}>
                      <SewingPinFilledIcon color="#666" /> New York, NY, USA
                    </Flex>
                  </InfoGroupContent>
                </InfoGroup>

                <InfoGroup>
                  <InfoGroupTitle>Last logged in</InfoGroupTitle>
                  <InfoGroupContent>
                    2022/2/5 09:17:25,{" "}
                    <Flex css={{ ai: "center" }}>
                      <SewingPinFilledIcon color="#666" /> New York, NY, USA
                    </Flex>
                  </InfoGroupContent>
                </InfoGroup>
              </Flex>

              <CodeSnippet></CodeSnippet>
            </Grid>
          </Container>
        </Content>
      </Wrapper>
    </AppLayout>
  );
}
