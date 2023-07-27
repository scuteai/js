import type { ScuteIdentifier } from "@scute/react";
import { BellIcon } from "../assets/icons";
import {
  Badge,
  Button,
  Flex,
  Heading,
  IconHolder,
  Panel,
  Text,
} from "../components";

interface RememberedIdentifierPanelProps {
  identifier: ScuteIdentifier;
  resetHandler: () => void;
}

const RememberedIdentifierPanel = ({
  identifier,
  resetHandler,
}: RememberedIdentifierPanelProps) => {
  return (
    <>
      <Heading size="1" css={{ color: "$headingColor" }}>
        Welcome back!
      </Heading>
      <Panel css={{ mt: "$4", mb: "$5" }}>
        <Flex gap={2} css={{ ai: "center", jc: "space-between" }}>
          <Flex>
            <IconHolder>
              <BellIcon />
            </IconHolder>
            <Flex css={{ fd: "column" }}>
              <Text size="1" css={{ pl: "$2" }}>
                Sign in as
              </Text>
              <Badge>{identifier}</Badge>
            </Flex>
          </Flex>
          <Button variant="alt" onClick={() => resetHandler()}>
            Change user
          </Button>
        </Flex>
      </Panel>
    </>
  );
};

export default RememberedIdentifierPanel;
