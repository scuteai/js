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
  identifier,
  error,
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
        Let&#39;s register your device
      </Heading>
      {error ? (
        <Text size="2" css={{ color: "$errorColor", mb: "$1" }}>
          An error occurred while registering your device
        </Text>
      ) : (
        <Text css={{ color: "$textColor" }}>
          Log into your account with the method you already use to unlock your
          device
        </Text>
      )}
      <Flex css={{ jc: "center", py: "$5" }}>
        <Badge size="1">{identifier}</Badge>
      </Flex>
      <Flex css={{ jc: "space-around" }}>
        <Button variant="alt" onClick={() => registerDevice()}>
          {!error ? "Register Device" : "Try Again"}
        </Button>
        {isWebauthnOptional || error ? (
          <Button variant="alt" onClick={() => skipAndLogin()}>
            Skip and login
          </Button>
        ) : null}
      </Flex>
    </Inner>
  </>
);

export default BioRegister;
