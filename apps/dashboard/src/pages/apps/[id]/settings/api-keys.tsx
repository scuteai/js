import {
  Flex,
  Text,
  Button,
  Container,
  Card,
  Heading,
  Code,
  IconButton,
  Dialog,
  TextField,
} from "@radix-ui/themes";
import { Layout } from "@/components/shared/Layout";
import {
  CopyIcon,
  EyeClosedIcon,
  EyeOpenIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { useState } from "react";

const ApiKeyRow = () => {
  const [tokenVisible, setTokenVisible] = useState(false);

  const invisibleStyle = { transition: "all .3s ease", filter: "blur(4px)" };
  const visibleStyle = { transition: "all .3s ease", filter: "blur(0px)" };
  return (
    <Card variant="surface" size="3">
      <Flex direction="column" gap="5">
        <Flex align="center" justify="between">
          <Code variant="soft" color="lime">
            Nickname
          </Code>
          <Flex align="center" gap="2">
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              onClick={() => setTokenVisible(!tokenVisible)}
            >
              {tokenVisible ? <EyeClosedIcon /> : <EyeOpenIcon />}
            </IconButton>
            <Button size="1" color="tomato">
              Revoke <TrashIcon />
            </Button>
          </Flex>
        </Flex>
        <Flex justify="between" align="center">
          <Text style={tokenVisible ? visibleStyle : invisibleStyle} size="3">
            scuteprod_4lp7bh3IOBTKdJ5Py8O4vW6qtoi5JA1KV2ln
          </Text>
          <Button variant="ghost" size="1" color="gray">
            <CopyIcon /> Copy
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
};

const CreateApiKeyModal = () => {
  return (
    <Dialog.Root>
      <Dialog.Trigger>
        <Button variant="classic">Create new key</Button>
      </Dialog.Trigger>

      <Dialog.Content size="4" style={{ maxWidth: 450 }}>
        <Dialog.Title>Create API Key</Dialog.Title>
        <Dialog.Description size="2" mb="4">
          Name your new API Key.
        </Dialog.Description>

        <Flex direction="column" gap="3">
          <label>
            <Text as="div" size="2" mb="1" weight="bold">
              API Key name
            </Text>
            <TextField.Input
              color="pink"
              variant="soft"
              placeholder="Enter a nickname for this API Key"
            />
          </label>
        </Flex>

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Dialog.Close>
            <Button variant="classic">Save</Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default function ApiKeysSettings() {
  return (
    <Layout titleBarContent={<CreateApiKeyModal />}>
      <Container size="2">
        <Flex direction="column" gap="2">
          <ApiKeyRow />
          <ApiKeyRow />
          <ApiKeyRow />
        </Flex>
        <Flex direction="column" gap="2" style={{ marginTop: "60px" }}>
          <Card variant="surface" size="3">
            <Flex direction="column" gap="3">
              <Flex direction='column'>
              <Heading size="3">Documentation</Heading>
              <Text size='2'>
                Not sure how to use Scute? You can learn about our API on our
                documentation page
              </Text>
              </Flex>
              <Flex>
                <Button variant="outline" color="lime">View documentation</Button>
              </Flex>
            </Flex>
          </Card>
        </Flex>
      </Container>
    </Layout>
  );
}
