import {
  AUTH_CHANGE_EVENTS,
  getMeaningfulError,
  SCUTE_MAGIC_PARAM,
  SCUTE_SKIP_PARAM,
  type ScuteIdentifier,
  type ScuteTokenPayload,
  type UniqueIdentifier,
} from "@scute/core";

import { VIEWS } from "@scute/ui-shared";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { FatalErrorIcon, EmailIcon } from "../assets/icons";

import {
  Badge,
  Button,
  Flex,
  Heading,
  Inner,
  LargeSpinner,
  QueryContainer,
  ResponsiveContainer,
  ResponsiveLeft,
  ResponsiveRight,
  Text,
} from "../components";

import useEffectOnce from "../helpers/useEffectOnce";
import useInterval from "../helpers/useInterval";

import { CommonViewProps } from "./common";
import { translateError } from "../helpers/i18n/service";

export interface VerifyMagicLinkOtpProps extends CommonViewProps {
  magicLinkId?: UniqueIdentifier;
  magicLinkToken?: string;
  getAuthPayloadCallback?: (payload: ScuteTokenPayload) => void;
}

const TIMER_START = 30;

const VerifyMagicLinkOtp = ({
  scuteClient,
  identifier: _identifier,
  setAuthView,
  setIsFatalError,
  magicLinkId,
  magicLinkToken: _magicLinkToken,
  getAuthPayloadCallback,
  setIslandProps,
  resetIslandProps,
}: VerifyMagicLinkOtpProps) => {
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isVerifyCalled, setIsVerifyCalled] = useState(false);
  const [identifier, setIdentifier] = useState(_identifier);
  const [time, setTime] = useState(TIMER_START);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [shouldSkip] = useState(
    () => !!new URL(window.location.href).searchParams.get(SCUTE_SKIP_PARAM)
  );

  const { t } = useTranslation();
  const isBroadcastMagicVerified = useRef<boolean>(false);

  const [magicLinkToken] = useState(
    () =>
      _magicLinkToken ??
      (typeof window !== "undefined" && typeof URLSearchParams !== "undefined"
        ? new URL(window.location.href).searchParams.get(SCUTE_MAGIC_PARAM)
        : null)
  );

  // useEffect(() => {
  //     setIslandProps &&
  //     setIslandProps({
  //       label: t("verifyOTP.loading.title"),
  //       active: true,
  //       Icon: <EmailIcon color="var(--scute-colors-buttonIdleBg)" />,
  //     });
  //   return () => {
  //     resetIslandProps && resetIslandProps();
  //   };
  // }, [isVerifyCalled]);

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
    () => {
      if (time > 0) {
        setTime(time - 1);
      }
    },
    time > 0 ? 1000 : null
  );

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
      resetIslandProps && resetIslandProps();
      const { isFatal } = getMeaningfulError(signInError);
      setIsFatalError?.(isFatal);
      const translatedErrorMessage = translateError(signInError);
      setError(translatedErrorMessage);
    }
  };

  useEffectOnce(() => {
    if (!magicLinkToken) {
      setIslandProps!({
        label: t("verifyOTP.loading.title"),
        active: true,
        Icon: <EmailIcon color="var(--scute-colors-buttonIdleBg)" />,
      });
      return;
    }

    const url = new URL(window.location.href);

    async function verifyMagicLink() {
      const { data, error: verifyError } =
        await scuteClient.verifyMagicLinkToken(magicLinkToken!);

      if (verifyError) {
        resetIslandProps && resetIslandProps();
        const { isFatal } = getMeaningfulError(verifyError);
        setIsFatalError?.(isFatal);
        const translatedErrorMessage = translateError(verifyError);
        setError(translatedErrorMessage);
        return;
      }

      const isWebauthnAvailable =
        scuteClient.isWebauthnSupported() &&
        data.magicPayload.webauthnEnabled !== false;

      if (!shouldSkip) {
        if (isWebauthnAvailable) {
          setAuthView(VIEWS.WEBAUTHN_REGISTER);
        } else {
          handleLogin(data.authPayload);
        }
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
      url.searchParams.delete(SCUTE_SKIP_PARAM);
      window.history.replaceState(window.history.state, "", url.toString());
    };
  });

  if (magicLinkToken) {
    if (!isVerifyCalled) {
      return <LargeSpinner />;
    }
    return (
      <LoadingMagic
        identifier={identifier}
        backToLogin={() => setAuthView(VIEWS.SIGN_IN_OR_UP)}
        error={error}
        shouldSkip={shouldSkip}
      />
    );
  }

  return (
    <QueryContainer>
      <ResponsiveContainer
        css={{
          pt: "$8",
          "@container queryContainer (max-width: 470px)": {
            pt: "$7",
          },
        }}
      >
        <ResponsiveLeft>
          <Inner
            css={{
              jc: "center",
              fd: "column",
              ta: "center",
              pb: "$5",
              "@container queryContainer (min-width: 950px)": {
                ta: "left",
              },
            }}
          >
            <Heading size="4">{t("verifyOTP.newDeviceTitle")}</Heading>
            <Text size="2" css={{ mb: "$4" }}>
              {t("verifyOTP.newDeviceBody")}
            </Text>
            <Flex css={{ jc: "center" }}>
              {identifier && (
                <Badge size="1" css={{ color: "$panelText" }}>
                  <EmailIcon
                    color="var(--scute-colors-panelText)"
                    style={{ height: "14px", opacity: 0.5, marginRight: 8 }}
                  />
                  {identifier}
                </Badge>
              )}
            </Flex>
          </Inner>
        </ResponsiveLeft>
        <ResponsiveRight>
          <Inner
            css={{
              display: "flex",
              jc: "center",
              fd: "column",
              height: "100%",
            }}
          >
            <Flex direction="column" align="center">
              <Button
                size="2"
                variant="alt"
                disabled={time > 0 || resendDisabled}
                css={{ mb: "$3" }}
                onClick={async () => {
                  setResendDisabled(true);
                  const { data, error: magicLinkError } =
                    await scuteClient.sendLoginMagicLink(identifier);
                  if (magicLinkError) {
                    const translatedErrorMessage =
                      translateError(magicLinkError);
                    setError(translatedErrorMessage);
                    return;
                  }
                  setTime(TIMER_START);
                  setResendDisabled(false);
                }}
              >
                {time > 0 && `[0:${time.toString().padStart(2, "0")}]`}{" "}
                {t("general.resendEmail")}
              </Button>
              <Button
                size="2"
                variant="alt"
                onClick={() => setAuthView(VIEWS.SIGN_IN_OR_UP)}
              >
                {t("general.changeEmail")}
              </Button>
            </Flex>
          </Inner>
        </ResponsiveRight>
      </ResponsiveContainer>
    </QueryContainer>
  );
};

const LoadingMagic = ({
  identifier,
  backToLogin,
  error,
  shouldSkip,
}: {
  identifier: ScuteIdentifier;
  backToLogin: () => void;
  error?: string | null;
  shouldSkip?: boolean;
}) => {
  const { t } = useTranslation();

  return (
    <>
      <QueryContainer>
        <ResponsiveContainer>
          <ResponsiveLeft>
            <Inner
              css={{
                display: "flex",
                jc: "center",
                fd: "column",
                textAlign: "center",
                "@container queryContainer (min-width: 950px)": {
                  ta: "left",
                },
              }}
            >
              <Flex css={{ mb: "$4" }}>
                {!error ? (
                  <LargeSpinner spinnerColor="green" />
                ) : (
                  <Flex css={{ jc: "center", width: "100%" }}>
                    <FatalErrorIcon color="var(--scute-colors-errorColor)" />
                  </Flex>
                )}
              </Flex>
              {!error ? (
                <></>
              ) : (
                <>
                  <Heading size="4">{t("general.somethingWentWrong")}</Heading>
                  <Text size="2" css={{ color: "$errorColor", mb: "$4" }}>
                    {error}
                  </Text>
                </>
              )}
            </Inner>
          </ResponsiveLeft>
          <ResponsiveRight>
            <Inner
              css={{
                display: "flex",
                jc: "center",
                height: "100%",
                alignItems: "center",
                pt: "$4",
              }}
            >
              {!shouldSkip && (
                <Button
                  variant="alt"
                  size="2"
                  onClick={() => {
                    backToLogin();
                  }}
                >
                  {t("general.backToLogin")}
                </Button>
              )}
            </Inner>
          </ResponsiveRight>
        </ResponsiveContainer>
      </QueryContainer>
    </>
  );
};

export default VerifyMagicLinkOtp;
