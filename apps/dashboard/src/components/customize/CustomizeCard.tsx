"use client";
import type { ScuteAppData } from "@/types";
import {
  Box,
  Card,
  Code,
  Grid,
  Heading,
  Tabs,
  TextArea,
} from "@radix-ui/themes";
import { type Theme } from "@scute/ui-react";
import { useState } from "react";
import { MockAuth } from "./MockAuth";
import { MockProfile } from "./MockProfile";

interface CustomizeCardProps {
  appData: ScuteAppData;
}

export const CustomizeCard = ({ appData }: CustomizeCardProps) => {
  const [theme, setTheme] = useState<Theme>({
    colors: {
      hiContrast: "hsl(206,2%,93%)",
      loContrast: "hsl(206,8%,8%)",
      cardBg: "red",
      contrast0: "#ffffff",
      contrast1: "#EDEDED",
      contrast2: "#DEDEDE",
      contrast3: "#BABABA",
      contrast4: "#999999",
      contrast5: "#757575",
      contrast6: "#545454",
      contrast7: "#424242",
      contrast8: "#333333",
      contrast9: "red",
      contrast10: "red",
    },
    space: {},
    fonts: {},
  });

  return (
    <Card size="3">
      <Grid columns={{ initial: "1", md: "2" }} gap="5" width="auto">
        <Card size="3" variant="ghost">
          <Heading>Theme</Heading>

          <Code size="1">
            <TextArea
              size="1"
              defaultValue={JSON.stringify(theme, null, 4)}
              onChange={(e) => {
                try {
                  const newTheme = JSON.parse(e.target.value);
                  setTheme(newTheme);
                } catch {}
              }}
              style={{
                height: "90%",
              }}
            />
          </Code>
        </Card>
        <Card variant="classic">
          <Tabs.Root defaultValue="login">
            <Tabs.List>
              <Tabs.Trigger value="login">Login</Tabs.Trigger>
              <Tabs.Trigger value="profile">Profile</Tabs.Trigger>
            </Tabs.List>

            <Box px="4" pt="3" pb="2">
              <Tabs.Content value="login">
                <MockAuth
                  logo={appData.logo}
                  required_identifiers={appData.required_identifiers}
                  allowed_identifiers={appData.allowed_identifiers}
                  appearance={{ theme }}
                />
              </Tabs.Content>

              <Tabs.Content value="profile">
                <MockProfile
                  logo={appData.logo}
                  required_identifiers={appData.required_identifiers}
                  allowed_identifiers={appData.allowed_identifiers}
                  appearance={{ theme }}
                />
              </Tabs.Content>
            </Box>
          </Tabs.Root>
        </Card>
      </Grid>
    </Card>
  );
};
