import { VIEWS } from "@scute/ui-shared";

import {
  Badge,
  Button,
  Flex,
  Header,
  Heading,
  Inner,
  LargeSpinner,
  Text,
} from "../../components";
import { CommonViewProps } from "../common";

export interface MagicNewDevicePendingProps extends CommonViewProps {
  resendAllowed: boolean;
  resendEmail: () => void;
}

const MagicNewDevicePending = ({
  identifier,
  setAuthView,
  resendAllowed,
  resendEmail,
}: MagicNewDevicePendingProps) => {
  return (
    <>
      <Header css={{ mb: "$1" }}>
        <LargeSpinner
          iconColor="var(--scute-colors-contrast8)"
          spinnerColor="var(--scute-colors-focusColor)"
        />
      </Header>
      <Inner
        css={{
          display: "flex",
          jc: "center",
          fd: "column",
          textAlign: "center",
        }}
      >
        <Heading size="1" css={{ color: "$headingColor" }}>
          This is a new device, to remember it we need to register it first
        </Heading>
        <Text size="2" css={{ color: "$textColor", mb: "$1" }}>
          {`We’ve sent an email to your inbox with`} <br />a one-time link.
        </Text>
        <Text size="2">
          You will be automatically signed in here once you click that link.
        </Text>
        <Flex css={{ jc: "center", py: "$5" }}>
          <Badge size="1">{identifier}</Badge>
        </Flex>
        <Flex css={{ jc: "space-between" }}>
          <Button
            variant="alt"
            onClick={() => setAuthView(VIEWS.SIGN_IN_OR_UP)}
          >
            Change email
          </Button>
          <Button
            variant="alt"
            disabled={resendAllowed ? true : undefined}
            onClick={() => resendEmail()}
          >
            Resend email
          </Button>
        </Flex>
      </Inner>
    </>
  );
};

export default MagicNewDevicePending;
