import {
  SCUTE_REMEMBER_STORAGE_KEY,
  ScuteBrowserCookieStorage,
  getMeaningfulError,
  type ScuteTokenPayload,
  type ScuteWebauthnOption,
} from "@scute/core";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

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

  const cookieStore = new ScuteBrowserCookieStorage();

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
    await cookieStore.setItem(SCUTE_REMEMBER_STORAGE_KEY, "true");

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
    await cookieStore.removeItem(SCUTE_REMEMBER_STORAGE_KEY);

    const { error: signInError } = await scuteClient.signInWithTokenPayload(
      authPayload
    );

    if (signInError) {
      const { isFatal, message: errorMsg } = getMeaningfulError(signInError);
      setIsFatalError?.(isFatal);
      setError(errorMsg);
    }
  };

  const { t } = useTranslation();

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
            ? t("registerDevice.registerDeviceTitle")
            : t("registerDevice.trustDeviceTitle")}
        </Heading>
        {error ? (
          <Text size="2" css={{ color: "$errorColor", mb: "$1" }}>
            {error}
          </Text>
        ) : (
          <Text css={{ color: "$textColor" }}>
            {isWebauthnSupported
              ? t("registerDevice.logInWebAuthn")
              : t("registerDevice.logInNoWebAuthn")}
          </Text>
        )}
        <Flex css={{ jc: "center", py: "$5" }}>
          <Badge size="1">{identifier}</Badge>
        </Flex>
        <Flex css={{ jc: "space-around" }}>
          <Button variant="alt" onClick={() => handleRegisterDevice()}>
            {!error
              ? isWebauthnSupported
                ? t("registerDevice.registerDevice")
                : t("registerDevice.trustDevice")
              : t("general.tryAgain")}
          </Button>
          {webauthn === "optional" || error ? (
            <Button variant="alt" onClick={() => handleSkipAndLogin()}>
              {isWebauthnSupported
                ? t("registerDevice.skipAndLogin")
                : t("registerDevice.dontTrustDevice")}
            </Button>
          ) : null}
        </Flex>
      </Inner>
    </>
  );
};

export default RegisterDevice;
