import {
  Flex,
  Text,
  Button,
  Container,
  Card,
  Heading,
  Checkbox,
  Switch,
} from "@radix-ui/themes";
import { Layout } from "@/components/shared/Layout";
import { STextField } from "@/components/settings/STextField";
import { SCardBottom } from "@/components/settings/SCardBottom";
import { CopyIcon } from "@radix-ui/react-icons";
import { SettingSectionShell } from "@/components/settings/SettingSectionShell";

const SectionGeneral = () => {
  return (
    <Card size="3">
      <Flex direction="column" gap="5">
        <Heading color="gray">Authentication</Heading>
        <SettingSectionShell
          title="Public signups"
          description="Allow users to self-register for your application."
          flexRow={true}
          separator
        >
          <Flex>
            <Switch color="lime" defaultChecked />
          </Flex>
        </SettingSectionShell>
        <SettingSectionShell
          title="Profile management"
          description="Allow users to edit their account information, including email address and phone number. Users will always be able to manage their passkeys."
          flexRow={true}
          separator
        >
          <Flex>
            <Switch color="lime" defaultChecked />
          </Flex>
        </SettingSectionShell>

        <SettingSectionShell
          title="Supported identifiers"
          description="Choose how your users will identify themselves on your app."
          flexRow={false}
        >
          <Flex gap="7">
            <Flex align="center" gap="2">
              <Checkbox
                id="checkbox-7"
                size="1"
                defaultChecked
                checked
                disabled
              />
              <label htmlFor="checkbox-7">
                <Text size="1">
                  Email{" "}
                  <span style={{ color: "var(--lime-11)" }}>* required</span>
                </Text>
              </label>
            </Flex>
            <Flex align="center" gap="2">
              <Checkbox id="checkbox-7" size="1" disabled />
              <label htmlFor="checkbox-7">
                <Text size="1">
                  Phone number{" "}
                  <span style={{ color: "var(--orange-11)" }}>(soon)</span>
                </Text>
              </label>
            </Flex>
          </Flex>
        </SettingSectionShell>
       
      </Flex>
    </Card>
  );
};

const SectionSessionManagement = () => {
  return (
    <Card size="3">
      <Flex direction="column" gap="5">
        <Heading color="gray">Session management</Heading>
        <STextField title="Access token expiration" value="3600" separator />
        <SettingSectionShell
          title="Enable refresh token"
          description="Use refresh tokens to safely enable long-lived sessions. "
          flexRow={true}
          separator
        >
          <Flex>
            <Switch defaultChecked color="lime" />
          </Flex>
        </SettingSectionShell>
        <STextField title="Refresh token expiration" value="3600" separator />
        <STextField title="Magic link duration" value="3600" />
        <Flex style={{ marginBottom: "10px" }} />
        <SCardBottom>
          <Button variant="classic">Save</Button>
        </SCardBottom>
      </Flex>
    </Card>
  );
};

export default function AppAuthSettings() {
  return (
    <Layout>
      <Container size="2">
        <Flex direction="column" gap="4">
          <SectionGeneral />
          <SectionSessionManagement />
        </Flex>
      </Container>
    </Layout>
  );
}
