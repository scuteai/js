import { VIEWS } from "@scute/ui-shared";
import { BiometricsIcon } from "../../assets/icons";

import {
  Badge,
  Button,
  Flex,
  Header,
  Heading,
  Inner,
  Text,
} from "../../components";
import { type CommonViewProps } from "../common";

interface BioVerifyProps extends CommonViewProps {}

const BioVerify = ({ email, setAuthView }: BioVerifyProps) => (
  <>
    <Header>
      <BiometricsIcon color="var(--scute-colors-contrast8)" />
    </Header>
    <Inner
      css={{ display: "flex", jc: "center", fd: "column", textAlign: "center" }}
    >
      <Heading size="1" css={{ color: "$headingColor" }}>
        Verify your identity
      </Heading>
      <Text css={{ color: "$textColor" }}>
        Log into your account with the method you already use to unlock your
        device
      </Text>
      <Flex css={{ jc: "center", py: "$5" }}>
        <Badge size="1">{email}</Badge>
      </Flex>
      <Flex css={{ jc: "space-between" }}>
        <Button variant="alt" onClick={() => setAuthView(VIEWS.LOGIN)}>
          Change email
        </Button>
      </Flex>
    </Inner>
  </>
);

export default BioVerify;
