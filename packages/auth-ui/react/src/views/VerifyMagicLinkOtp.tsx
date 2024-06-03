import {
  AUTH_CHANGE_EVENTS,
  getMeaningfulError,
  SCUTE_MAGIC_PARAM,
  type ScuteIdentifier,
  type ScuteTokenPayload,
  type UniqueIdentifier,
} from "@scute/core";

import { VIEWS } from "@scute/ui-shared";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { EmailIcon } from "../assets/icons";

import {
  Badge,
  Button,
  Flex,
  Header,
  Heading,
  Inner,
  LargeSpinner,
  Text,
} from "../components";

import useEffectOnce from "../helpers/useEffectOnce";
import useInterval from "../helpers/useInterval";

import { CommonViewProps } from "./common";
import { translateError } from "../helpers/i18n/service";

export interface VerifyMagicLinkOtpProps extends CommonViewProps {
  isWebauthnNewDevice?: boolean;
  magicLinkId?: UniqueIdentifier;
  magicLinkToken?: string;
  getAuthPayloadCallback?: (payload: ScuteTokenPayload) => void;
}

const VerifyMagicLinkOtp = ({
  scuteClient,
  identifier: _identifier,
  setAuthView,
  setIsFatalError,
  magicLinkId,
  magicLinkToken: _magicLinkToken,
  isWebauthnNewDevice,
  getAuthPayloadCallback,
}: VerifyMagicLinkOtpProps) => {
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isVerifyCalled, setIsVerifyCalled] = useState(false);
  const [identifier, setIdentifier] = useState(_identifier);

  const { t } = useTranslation();
  const isBroadcastMagicVerified = useRef<boolean>(false);

  const [magicLinkToken] = useState(
    () =>
      _magicLinkToken ??
      (typeof window !== "undefined" && typeof URLSearchParams !== "undefined"
        ? new URL(window.location.href).searchParams.get(SCUTE_MAGIC_PARAM)
        : null)
  );

  useEffect(() => {
    setIsPolling(Boolean(magicLinkId));
  }, [magicLinkId]);

  useEffect(() => {
    const unsubscribe = scuteClient.onAuthStateChange(async (event) => {
      if (event === AUTH_CHANGE_EVENTS.MAGIC_VERIFIED) {
        isBroadcastMagicVerified.current = true;
      }
    });

    return () => unsubscribe();
  }, []);

  useInterval(
    async () => {
      if (magicLinkId) {
        const { data: payload, error: magicLinkIdLoginError } =
          await scuteClient.getMagicLinkStatus(magicLinkId);

        if (!magicLinkIdLoginError) {
          if (isBroadcastMagicVerified.current) {
            setIsPolling(false);
          } else {
            handleLogin(payload);
          }
        }
      }
    },
    !isBroadcastMagicVerified.current && isPolling && magicLinkToken === null
      ? 5000
      : null
  );

  const handleLogin = async (payload: ScuteTokenPayload) => {
    const { error: signInError } = await scuteClient.signInWithTokenPayload(
      payload
    );

    if (signInError) {
      const { isFatal } = getMeaningfulError(signInError);
      setIsFatalError?.(isFatal);
      const translatedErrorMessage = translateError(signInError);
      setError(translatedErrorMessage);
    }
  };

  useEffectOnce(() => {
    if (!magicLinkToken) {
      return;
    }

    const url = new URL(window.location.href);

    async function verifyMagicLink() {
      const { data, error: verifyError } =
        await scuteClient.verifyMagicLinkToken(magicLinkToken!);

      if (verifyError) {
        const { isFatal } = getMeaningfulError(verifyError);
        setIsFatalError?.(isFatal);
        const translatedErrorMessage = translateError(verifyError);
        setError(translatedErrorMessage);
        return;
      }

      const isWebauthnAvailable =
        scuteClient.isWebauthnSupported() &&
        data.magicPayload.webauthnEnabled !== false;

      if (isWebauthnAvailable) {
        setAuthView(VIEWS.WEBAUTHN_REGISTER);
      } else {
        handleLogin(data.authPayload);
      }

      if (!identifier) {
        try {
          const { data: userData } = await scuteClient.admin.getUserByUserId(
            data.magicPayload.uuid
          );

          const user = userData?.user;
          if (user && user.email) {
            // TODO: phone?
            setIdentifier(user.email);
          }
        } catch {}
      }

      getAuthPayloadCallback?.(data.authPayload);
    }

    verifyMagicLink().then(() => {
      setIsVerifyCalled(true);
    });

    return () => {
      url.searchParams.delete(SCUTE_MAGIC_PARAM);
      window.history.replaceState(window.history.state, "", url.toString());
    };
  });

  if (magicLinkToken) {
    if (!isVerifyCalled) {
      return null;
    }
    return (
      <LoadingMagic
        identifier={identifier}
        backToLogin={() => setAuthView(VIEWS.SIGN_IN_OR_UP)}
        error={error}
      />
    );
  }

  return (
    <>
      <Header css={{ mb: "$1" }}>
        <LargeSpinner
          icon={<EmailIcon color="var(--scute-colors-contrast8)" />}
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
          {isWebauthnNewDevice
            ? t("verifyOTP.newDeviceTitle")
            : t("verifyOTP.checkEmailTitle")}
        </Heading>
        <Text size="2" css={{ color: "$textColor", mb: "$1" }}>
          {t("verifyOTP.bodyP1Part1")} <br />
          {t("verifyOTP.bodyP1Part2")}
        </Text>
        <Text size="2">{t("verifyOTP.bodyP2")}</Text>
        <Flex css={{ jc: "center", py: "$5" }}>
          <Badge size="1">{identifier}</Badge>
        </Flex>
        <Flex css={{ jc: "space-between" }}>
          <Button
            variant="alt"
            onClick={() => setAuthView(VIEWS.SIGN_IN_OR_UP)}
          >
            {t("general.changeEmail")}
          </Button>
          <Button variant="alt" disabled>
            {t("general.resendEmail")}
          </Button>
        </Flex>
      </Inner>
    </>
  );
};

const LoadingMagic = ({
  identifier,
  backToLogin,
  error,
}: {
  identifier: ScuteIdentifier;
  backToLogin: () => void;
  error?: string | null;
}) => {
  const { t } = useTranslation();

  return (
    <>
      <Header css={{ mb: "$1" }}>
        {!error ? (
          <LargeSpinner
            icon={<EmailIcon color="var(--scute-colors-contrast8)" />}
            spinnerColor="green"
          />
        ) : (
          <EmailIcon />
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
        {!error ? (
          <>
            <Heading size="1" css={{ color: "$headingColor" }}>
              {t("verifyOTP.loading.title")}
            </Heading>
            <Text size="2" css={{ color: "$textColor", mb: "$1" }}></Text>
          </>
        ) : (
          <>
            <Text size="2" css={{ color: "$errorColor", mb: "$1" }}>
              {error}
            </Text>
            <Flex css={{ jc: "center", mt: "2rem" }}>
              <Button
                variant="alt"
                size="2"
                onClick={() => {
                  backToLogin();
                }}
              >
                {t("general.backToLogin")}
              </Button>
            </Flex>
          </>
        )}
        {identifier ? (
          <Flex css={{ jc: "center", py: "$5" }}>
            <Badge size="1">{identifier}</Badge>
          </Flex>
        ) : null}
      </Inner>
    </>
  );
};

export default VerifyMagicLinkOtp;
