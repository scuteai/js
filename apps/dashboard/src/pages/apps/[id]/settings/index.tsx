import { Flex, Text, Button, Container, Card, Heading } from "@radix-ui/themes";
import { Layout } from "@/components/shared/Layout";
import { STextField } from "@/components/settings/STextField";
import { SCardBottom } from "@/components/settings/SCardBottom";
import { CopyIcon } from "@radix-ui/react-icons";

const SectionAppConfig = () => {
  return (
    <Card size="3">
      <Flex direction="column" gap="5">
        <Heading color="gray">Application Config</Heading>
        <STextField
          title="Application name"
          description="The name of your application."
          placeholder="My App"
          separator
        />
        <STextField
          title="Auth origin"
          description="The url of your application."
          placeholder="/"
          separator
        />
        <STextField
          title="Callback URL"
          description="The name of your application."
          placeholder="/"
          separator
        />
        <STextField
          title="Login URL"
          description="The name of your application."
          placeholder="/"
        />

        <Flex style={{ marginBottom: "10px" }} />

        <SCardBottom>
          <Button size="2" color="green" variant="classic">
            Save
          </Button>
        </SCardBottom>
      </Flex>
    </Card>
  );
};

const SectionDelete = () => {
  return (
    <Card size="3">
      <Flex direction="column" gap="5">
        <Heading color="tomato">Danger zone</Heading>
        <Text
          size="1"
          color="tomato"
        >{`Once you’ve deleted an app this cannot be undone. Please make sure you are certain before deleting.`}</Text>

        <Flex style={{ marginBottom: "10px" }} />
        <SCardBottom>
          <Button size="2" color="tomato" variant="classic">
            Delete application
          </Button>
        </SCardBottom>
      </Flex>
    </Card>
  );
};

const SectionAppIdCopy = () => {
  return (
    <Card size="3">
      <Flex direction="column" gap="5">
        <Heading color="gray">Info</Heading>
        <STextField
          title="Application ID"
          disabled
          value="app_1234567890"
          inputActionSlot={
            <Button size="1" variant="outline">
              <CopyIcon /> Copy
            </Button>
          }
        />
        <STextField title="Public key" placeholder="My App" />
        <STextField
          title="Scute API URL"
          value="https://api.scute.io/app_13425435"
          disabled
        />
      </Flex>
    </Card>
  );
};

export default function AppSettings() {
  return (
    <Layout>
      <Container size="2">
        <Flex direction="column" gap="4">
          <SectionAppConfig />
          <SectionAppIdCopy />
          <SectionDelete />
        </Flex>
      </Container>
    </Layout>
  );
}
