import {
  getMeaningfulError,
  type ScuteTokenPayload,
  type ScuteWebauthnOption,
} from "@scute/core";

import { useEffect, useState } from "react";
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

interface RegisterDeviceProps extends CommonViewProps {
  webauthn?: ScuteWebauthnOption;
  authPayload: ScuteTokenPayload;
}

const RegisterDevice = ({
  identifier: _identifier,
  scuteClient,
  setIsFatalError,
  webauthn = "optional",
  authPayload,
}: RegisterDeviceProps) => {
  const [error, setError] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState<string | null>(_identifier);

  useEffect(() => {
    if (identifier) return;

    async function getUser() {
      const {
        data: { user },
      } = await scuteClient.getUser(authPayload.access);

      if (user) {
        // TODO: phone?
        setIdentifier(user.email);
      }
    }

    getUser();
  }, [identifier]);

  const handleRegisterDevice = async () => {
    const { error: registerDeviceError } =
      await scuteClient.signInWithRegisterDevice(authPayload);

    if (registerDeviceError) {
      const { isFatal, message: errorMsg } =
        getMeaningfulError(registerDeviceError);
      setIsFatalError?.(isFatal);
      setError(errorMsg);
    }
  };

  const handleSkipAndLogin = async () => {
    const { error: signInError } = await scuteClient.signInWithTokenPayload(
      authPayload
    );

    if (signInError) {
      const { isFatal, message: errorMsg } = getMeaningfulError(signInError);
      setIsFatalError?.(isFatal);
      setError(errorMsg);
    }
  };

  return (
    <>
      <Header>
        <BiometricsIcon color="var(--scute-colors-contrast8)" />
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
          Let&#39;s register your device
        </Heading>
        {error ? (
          <Text size="2" css={{ color: "$errorColor", mb: "$1" }}>
            {error}
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
          <Button variant="alt" onClick={() => handleRegisterDevice()}>
            {!error ? "Register Device" : "Try Again"}
          </Button>
          {webauthn === "optional" || error ? (
            <Button variant="alt" onClick={() => handleSkipAndLogin()}>
              Skip and login
            </Button>
          ) : null}
        </Flex>
      </Inner>
    </>
  );
};

export default RegisterDevice;
