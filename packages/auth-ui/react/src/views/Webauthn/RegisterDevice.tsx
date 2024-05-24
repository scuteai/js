import {
  getMeaningfulError,
  type ScuteTokenPayload,
  type ScuteWebauthnOption,
} from "@scute/core";

import { useEffect, useState } from "react";
import { BiometricsIcon, CircleCheckIcon } from "../../assets/icons";
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
  isWebauthnSupported: boolean;
}

const RegisterDevice = ({
  identifier: _identifier,
  scuteClient,
  setIsFatalError,
  webauthn = "optional",
  authPayload,
  isWebauthnSupported,
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
    if (isWebauthnSupported) {
      const { error: registerDeviceError } =
        await scuteClient.signInWithRegisterDevice(authPayload);

      if (registerDeviceError) {
        const { isFatal, message: errorMsg } =
          getMeaningfulError(registerDeviceError);
        setIsFatalError?.(isFatal);
        setError(errorMsg);
      }
    } else {
      const { error: signInError } = await scuteClient.signInWithTokenPayload(
        authPayload
      );

      if (signInError) {
        const { isFatal, message: errorMsg } = getMeaningfulError(signInError);
        setIsFatalError?.(isFatal);
        setError(errorMsg);
      }
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
        {isWebauthnSupported ? (
          <BiometricsIcon color="var(--scute-colors-contrast8)" />
        ) : (
          <CircleCheckIcon color="var(--scute-colors-contrast8)" />
        )}
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
          {isWebauthnSupported
            ? "Let&#39;s register your device"
            : "Do you trust this device? "}
        </Heading>
        {error ? (
          <Text size="2" css={{ color: "$errorColor", mb: "$1" }}>
            {error}
          </Text>
        ) : (
          <Text css={{ color: "$textColor" }}>
            {isWebauthnSupported
              ? "Log into your account with the method you already use to unlock your device"
              : "We'll keep you signed in on this device. To keep your account secure, use this option on your personal devices only."}
          </Text>
        )}
        <Flex css={{ jc: "center", py: "$5" }}>
          <Badge size="1">{identifier}</Badge>
        </Flex>
        <Flex css={{ jc: "space-around" }}>
          <Button variant="alt" onClick={() => handleRegisterDevice()}>
            {!error
              ? isWebauthnSupported
                ? "Register Device"
                : "Yes, trust device"
              : "Try Again"}
          </Button>
          {webauthn === "optional" || error ? (
            <Button variant="alt" onClick={() => handleSkipAndLogin()}>
              {isWebauthnSupported
                ? "Skip and login"
                : "No, don't trust device"}
            </Button>
          ) : null}
        </Flex>
      </Inner>
    </>
  );
};

export default RegisterDevice;
