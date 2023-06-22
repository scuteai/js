import { VIEWS } from "@scute/ui-shared";
import { BiometricsIcon } from "../../assets/icons";
import {
  Badge,
  Button,
  Flex,
  Text,
  Header,
  Heading,
  Inner,
} from "../../components";
import { type CommonViewProps } from "../common";

interface BioRegisterProps extends CommonViewProps {
  isWebauthnOptional: boolean;
  skipAndLogin: () => void;
  registerDevice: () => void;
}

const BioRegister = ({
  email,
  scuteClient,
  setAuthView,
  isWebauthnOptional,
  skipAndLogin,
  registerDevice,
}: BioRegisterProps) => (
  <>
    <Header>
      <BiometricsIcon color="var(--scute-colors-contrast8)" />
    </Header>
    <Inner
      css={{ display: "flex", jc: "center", fd: "column", textAlign: "center" }}
    >
      <Heading size="1" css={{ color: "$headingColor" }}>
        Let's register your device
      </Heading>
      <Text css={{ color: "$textColor" }}>
        Log into your account with the method you already use to unlock your
        device
      </Text>
      <Flex css={{ jc: "center", py: "$5" }}>
        <Badge size="1">{email}</Badge>
      </Flex>
      <Flex css={{ jc: "space-between" }}>
        <Button variant="alt" onClick={() => registerDevice()}>
          Register Device
        </Button>
        {isWebauthnOptional && (
          <Button variant="alt" onClick={() => skipAndLogin()}>
            Skip and login
          </Button>
        )}
      </Flex>
    </Inner>
  </>
);

export default BioRegister;
