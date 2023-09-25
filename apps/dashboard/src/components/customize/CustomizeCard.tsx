"use client";
import type { ScuteAppData } from "@/types";
import {
  Box,
  Card,
  Code,
  Grid,
  Button,
  Heading,
  Tabs,
  TextArea,
  Flex,
  Text,
} from "@radix-ui/themes";
import { type Theme } from "@scute/ui-react";
import { useState } from "react";
import { MockAuth } from "./MockAuth";
import { MockProfile } from "./MockProfile";
import { ColorPickerPop, FontPicker } from "./forms";
import { SettingSectionShell } from "../settings/SettingSectionShell";
import styles from "@/styles/CustomTheme.module.scss";

interface CustomizeCardProps {
  appData: ScuteAppData;
}

const themePropDefs = {
  textSizes: [
    { label: "Small", value: "14px" },
    { label: "Medium", value: "16px" },
    { label: "Large", value: "18px" },
  ],
};

export const CustomizeCard = ({ appData }: CustomizeCardProps) => {
  const [theme, setTheme] = useState<Theme>({
    colors: {
      hiContrast: "hsl(206,2%,93%)",
      loContrast: "hsl(206,8%,8%)",
      cardBg: "#ff0000",
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

          <ThemeCustomizer theme={theme} />

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


interface ThemeCustomizerProps {
  theme: Theme;
  onThemeChange?: (theme: Theme) => void;
}

const ThemeCustomizer = ({ theme, onThemeChange }: ThemeCustomizerProps) => {

  // const [colors, setColors] = useState({
  //   cardBg: "#ff0000"
  // });


  const setColor = (name:string, color:string) => {

    // const _colors = theme.colors

    onThemeChange?.({
      ...(theme as object),
      colors: {
        ...theme.colors,
        [name]: color,
      },
    });
  }

  return (
    <Card size="2">
      <Flex align="center" justify="between" style={{ marginBottom: "20px" }}>
        <Heading size="4">Custom theme</Heading>
        <Button color="green" variant="soft">
          Browse themes
        </Button>
      </Flex>
      <Flex direction="column" style={{ gap: "10px" }}>
        <SettingSectionShell flexRow title="Background color">
          <ColorPickerPop color={theme.colors.cardBg} onChange={(color:string) => setColor('cardBg', color)} />
        </SettingSectionShell>
        <SettingSectionShell flexRow title="Font">
          <FontPicker />
        </SettingSectionShell>
        <SettingSectionShell flexRow title="Text size">
          <Flex
            justify="end"
            align="stretch"
            style={{ gap: "10px" }}
            role="group"
            aria-labelledby="scaling-title"
          >
            {themePropDefs.textSizes.map((item) => (
              <label key={item.value} className={styles.ThemePanelRadioCard}>
                <input
                  className={styles.ThemePanelRadioCardInput}
                  type="radio"
                  name="scaling"
                  value={item.value}
                  // checked={textSize === item.value}
                  onChange={
                    (event) => console.log(event)
                    // onScalingChange(
                    //   event.target.value as ThemeOptions["scaling"]
                    // )
                  }
                />
                <Flex align="center" justify="center" height="6">
                  <Flex
                    align="center"
                    justify="center"
                    style={{ padding: "0px 10px" }}
                  >
                    <Text size="2" weight="medium">
                      {item.label}
                    </Text>
                  </Flex>
                </Flex>
              </label>
            ))}
          </Flex>
        </SettingSectionShell>
        <SettingSectionShell flexRow title="Text color">
          <ColorPickerPop />
        </SettingSectionShell>
      </Flex>
    </Card>
  );
};
