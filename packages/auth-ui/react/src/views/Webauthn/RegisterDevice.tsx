import {
  SCUTE_ID_VERIFICATION_PARAM,
  SCUTE_REMEMBER_STORAGE_KEY,
  ScuteBrowserCookieStorage,
  getMeaningfulError,
  type ScuteTokenPayload,
  type ScuteWebauthnOption,
} from "@scute/core";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  BiometricsIcon,
  CircleCheckIcon,
  EmailIcon,
  FingerprintIcon,
} from "../../assets/icons";
import {
  Badge,
  Button,
  Flex,
  Text,
  Header,
  Heading,
  Inner,
  QueryContainer,
  ResponsiveContainer,
  ResponsiveLeft,
  ResponsiveRight,
} from "../../components";
import { type CommonViewProps } from "../common";
import { translateError } from "../../helpers/i18n/service";

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
  resetIslandProps,
}: RegisterDeviceProps) => {
  const [error, setError] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState<string | null>(_identifier);

  const cookieStore = new ScuteBrowserCookieStorage();
  const isIdVerification = new URL(window.location.href).searchParams.get(
    SCUTE_ID_VERIFICATION_PARAM
  );

  useEffect(() => {
    resetIslandProps?.();
    if (identifier) return;

    async function getUser() {
      const {
        data: { user },
      } = await scuteClient.getUser(authPayload.access);

      if (user && user.email) {
        // TODO: phone?
        setIdentifier(user.email);
      } else if (user && user.phone) {
        setIdentifier(user.phone);
      }
    }

    getUser();
  }, [identifier]);

  const handleRegisterDevice = async () => {
    // TODO: This is a temporary workaround to clear the refresh token cookie
    // await cookieStore.setItem(SCUTE_REMEMBER_STORAGE_KEY, "true");

    if (isWebauthnSupported) {
      const { error: registerDeviceError } =
        await scuteClient.signInWithRegisterDevice(authPayload);

      if (registerDeviceError) {
        const { isFatal } = getMeaningfulError(registerDeviceError);
        setIsFatalError?.(isFatal);
        setError(translateError(registerDeviceError));
      }
    } else {
      const { error: signInError } = await scuteClient.signInWithTokenPayload(
        authPayload
      );

      if (signInError) {
        const { isFatal } = getMeaningfulError(signInError);
        setIsFatalError?.(isFatal);
        setError(translateError(signInError));
      }
    }
  };

  const handleSkipAndLogin = async () => {
    // TODO: This is a temporary workaround to clear the refresh token cookie
    // await cookieStore.removeItem(SCUTE_REMEMBER_STORAGE_KEY);

    const { error: signInError } = await scuteClient.signInWithTokenPayload(
      authPayload
    );

    if (signInError) {
      const { isFatal } = getMeaningfulError(signInError);
      setIsFatalError?.(isFatal);
      setError(translateError(signInError));
    }
  };

  const { t } = useTranslation();

  return (
    <QueryContainer>
      <ResponsiveContainer>
        <ResponsiveLeft>
          <Header
            css={{
              textAlign: "center",
              mb: isWebauthnSupported ? "$5" : "0",
              jc: "center",
              px: "$2",
            }}
          >
            {!isWebauthnSupported || isIdVerification ? (
              <CircleCheckIcon color="var(--scute-colors-svgIconColor)" />
            ) : (
              <BiometricsIcon color="var(--scute-colors-svgIconColor)" />
            )}
          </Header>
          <Inner
            css={{
              display: "flex",
              jc: "center",
              fd: "column",
              ta: "center",
              "@container queryContainer (min-width: 950px)": {
                ta: "left",
              },
            }}
          >
            <Heading size="4">
              {isIdVerification
                ? t("registerDevice.verifyIdentityTitle")
                : isWebauthnSupported
                ? t("registerDevice.registerDeviceTitle")
                : t("registerDevice.trustDeviceTitle")}
            </Heading>
            {error ? (
              <Text size="2" css={{ color: "$errorColor" }}>
                {error}
              </Text>
            ) : (
              <Text size="2">
                {isWebauthnSupported
                  ? t("registerDevice.logInWebAuthn")
                  : t("registerDevice.logInNoWebAuthn")}
              </Text>
            )}
            {identifier && (
              <Flex css={{ jc: "center", py: "$5" }}>
                <Badge size="1" css={{ color: "$panelText" }}>
                  <EmailIcon
                    color="var(--scute-colors-panelText)"
                    style={{ height: "14px", opacity: 0.5, marginRight: 8 }}
                  />
                  {identifier}
                </Badge>
              </Flex>
            )}
          </Inner>
        </ResponsiveLeft>
        <ResponsiveRight>
          <Inner
            css={{
              display: "flex",
              jc: "center",
              fd: "column",
              height: "100%",
              justifyContent: "center",
            }}
          >
            <Flex direction="column" css={{ jc: "space-around" }}>
              <Button
                css={{ mb: "$3" }}
                size="2"
                onClick={() => handleRegisterDevice()}
              >
                {!error
                  ? isWebauthnSupported
                    ? t("registerDevice.registerDevice")
                    : t("registerDevice.trustDevice")
                  : t("general.tryAgain")}
                {isWebauthnSupported && <FingerprintIcon />}
              </Button>
              {webauthn === "optional" || error ? (
                <Button
                  size="2"
                  variant="alt"
                  onClick={() => handleSkipAndLogin()}
                >
                  {isWebauthnSupported
                    ? t("registerDevice.skipAndLogin")
                    : t("registerDevice.dontTrustDevice")}
                </Button>
              ) : null}
            </Flex>
          </Inner>
        </ResponsiveRight>
      </ResponsiveContainer>
    </QueryContainer>
  );
};

export default RegisterDevice;
