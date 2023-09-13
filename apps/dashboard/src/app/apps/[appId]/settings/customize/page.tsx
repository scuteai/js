"use client";
import { Container, Grid, Flex, Card, Tabs, Text, Box, Heading} from "@radix-ui/themes";
import { useScuteClient } from "@scute/react";
import { AuthContextProvider } from "@scute/react";
import { darkTheme } from "@scute/ui-react";
import { Auth } from "@scute/ui-react";
import { createClientComponentClient } from "@scute/nextjs";
import { useState } from "react";

function AuthProvider({ children }: { children: ReactNode }) {
  const [scuteClient] = useState(() =>
    createClientComponentClient({
      appId: process.env.NEXT_PUBLIC_SCUTE_APP_ID,
      baseUrl: process.env.NEXT_PUBLIC_SCUTE_BASE_URL,
    })
  );

  return (
    <AuthContextProvider scuteClient={scuteClient}>
      {children}
    </AuthContextProvider>
  );
}

export default function Customize() {
  const scuteClient = useScuteClient();

  
  return (
    <Container size="3">
      <Card size='3'>
        <Grid columns={{ initial: "1", md: "2" }} gap="5" width="auto">
          <Card size='3' variant="ghost">
            <Heading>Theme</Heading>
          </Card>
          <Card variant="classic">
            <Tabs.Root defaultValue="account">
              <Tabs.List>
                <Tabs.Trigger value="account">Login</Tabs.Trigger>
                <Tabs.Trigger value="documents">Profile</Tabs.Trigger>
              </Tabs.List>

              <Box px="4" pt="3" pb="2">
                <Tabs.Content value="account">
                  {/* <Text size="2">Make changes to your account.</Text> */}
                </Tabs.Content>

                <Tabs.Content value="documents">
                  {/* <Text size="2">Access and update your documents.</Text> */}
                </Tabs.Content>
              </Box>
            </Tabs.Root>
            <AuthProvider>
              <Auth
                appearance={{ scuteBranding: true, theme: darkTheme }}
                scuteClient={scuteClient}
              />
            </AuthProvider>
          </Card>
        </Grid>
      </Card>
    </Container>
  );
}
