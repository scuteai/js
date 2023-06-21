import { VIEWS } from "@scute/auth-ui-shared";

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

export interface MagicLinkProps extends CommonViewProps {}

const MagicPending = ({ email, setAuthView }: MagicLinkProps) => {
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
          Check your email to login
        </Heading>
        <Text size="2" css={{ color: "$textColor", mb: "$1" }}>
          {`We’ve sent an email to your inbox with`} <br />a one-time link.
        </Text>
        <Text size="2">
          You will be automatically signed in here once you click that link.
        </Text>
        <Flex css={{ jc: "center", py: "$5" }}>
          <Badge size="1">{email}</Badge>
        </Flex>
        <Flex css={{ jc: "space-between" }}>
          <Button variant="alt" onClick={() => setAuthView(VIEWS.LOGIN)}>
            Change email
          </Button>
          <Button variant="alt" disabled>
            Resend email
          </Button>
        </Flex>
      </Inner>
    </>
  );
};

export default MagicPending;
