import {
  AUTH_CHANGE_EVENTS,
  getMeaningfulError,
  NewDeviceError,
  SCUTE_REMEMBER_STORAGE_KEY,
  ScuteBrowserCookieStorage,
  UniqueIdentifier,
} from "@scute/core";
import { VIEWS } from "@scute/ui-shared";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiometricsIcon, EmailIcon } from "../../assets/icons";

import {
  Badge,
  Button,
  Flex,
  Header,
  Heading,
  Inner,
  LargeSpinner,
  QueryContainer,
  ResponsiveContainer,
  ResponsiveLeft,
  ResponsiveRight,
  Text,
} from "../../components";
import useEffectOnce from "../../helpers/useEffectOnce";
import { type CommonViewProps } from "../common";
import { translateError } from "../../helpers/i18n/service";

interface VerifyDeviceProps extends CommonViewProps {
  getMagicLinkIdCallback?: (id: UniqueIdentifier) => void;
}

const VerifyDevice = ({
  scuteClient,
  identifier,
  setAuthView,
  setIsFatalError,
  getMagicLinkIdCallback,
}: VerifyDeviceProps) => {
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { t } = useTranslation();

  const cookieStore = new ScuteBrowserCookieStorage();

  const handleSendMagicLink = async (isNewDevice = false) => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    const { data, error: sendMagicLinkError } =
      await scuteClient.sendLoginMagicLink(identifier, undefined, !isNewDevice);

    if (sendMagicLinkError) {
      const { isFatal } = getMeaningfulError(sendMagicLinkError);
      setIsFatalError?.(isFatal);
      setError(translateError(sendMagicLinkError));
      return;
    }

    const magicLinkId = data?.magic_link.id;
    if (magicLinkId) {
      getMagicLinkIdCallback?.(magicLinkId);
    }
    setSubmitting(true);
  };

  const handleVerifyDevice = async () => {
    // TODO: This is a temporary workaround to clear the refresh token cookie
    // await cookieStore.setItem(SCUTE_REMEMBER_STORAGE_KEY, "true");

    const { error: verifyDeviceError } =
      await scuteClient.signInWithVerifyDevice(identifier);

    setInitialized(true);

    if (verifyDeviceError instanceof NewDeviceError) {
      handleSendMagicLink(true);
      setAuthView(VIEWS.MAGIC_NEW_DEVICE_PENDING);
    }

    if (verifyDeviceError) {
      const { isFatal } = getMeaningfulError(verifyDeviceError);

      setIsFatalError?.(isFatal);
      setError(translateError(verifyDeviceError));
    }
  };

  useEffect(() => {
    return scuteClient.onAuthStateChange((event) => {
      if (event === AUTH_CHANGE_EVENTS.WEBAUTHN_VERIFY_START) {
        // no error on initialize
        setInitialized(true);
      }
    });
  }, []);

  useEffectOnce(() => {
    // run onmount
    handleVerifyDevice();
  });

  if (!initialized) {
    return (
      <>
        <Inner
          css={{
            display: "flex",
            jc: "center",
            fd: "column",
            textAlign: "center",
            minHeight: "12rem",
          }}
        >
          <LargeSpinner />
        </Inner>
      </>
    );
  }

  return (
    <QueryContainer>
      <ResponsiveContainer>
        <ResponsiveLeft>
          <Header css={{ textAlign: "center", mb: "$5", jc: "center" }}>
            <BiometricsIcon color="var(--scute-colors-svgIconColor)" />
          </Header>
          <Inner
            css={{
              display: "flex",
              jc: "center",
              fd: "column",
              textAlign: "center",
            }}
          >
            <Heading size="4">{t("verifyDevice.verifyDeviceTitle")}</Heading>

            {error ? (
              <Text size="2" css={{ color: "$errorColor", mb: "$1" }}>
                {error}
                <br />
                {t("verifyDevice.tryAgain")}
              </Text>
            ) : (
              <Text>{t("verifyDevice.verifyDeviceBody")}</Text>
            )}
            {identifier && (
              <Flex css={{ jc: "center", py: "$5" }}>
                <Badge size="1">
                  <EmailIcon
                    color="var(--scute-colors-svgIconColor)"
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
              textAlign: "center",
              height: "100%",
            }}
          >
            <Flex
              direction="column"
              css={{ jc: "center", alignItems: "center", height: "100%" }}
            >
              <Button
                size="2"
                variant="alt"
                css={{ mb: "$3" }}
                onClick={() => {
                  if (error) {
                    setError(null);
                    handleVerifyDevice();
                  } else {
                    setAuthView(VIEWS.SIGN_IN_OR_UP);
                  }
                }}
              >
                {!error ? t("general.changeEmail") : t("general.tryAgain")}
              </Button>
              <Button
                size="2"
                variant="alt"
                onClick={() => handleSendMagicLink()}
              >
                {t("verifyDevice.signInMagicLink")}
              </Button>
            </Flex>
          </Inner>
        </ResponsiveRight>
      </ResponsiveContainer>
    </QueryContainer>
  );
};

export default VerifyDevice;
