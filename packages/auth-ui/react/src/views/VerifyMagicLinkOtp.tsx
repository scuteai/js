import {
  getMeaningfulError,
  SCUTE_MAGIC_PARAM,
  type ScuteIdentifier,
  type ScuteTokenPayload,
  type UniqueIdentifier,
} from "@scute/core";

import { VIEWS } from "@scute/ui-shared";
import { useEffect, useState } from "react";
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

  const [magicLinkToken] = useState(
    () =>
      _magicLinkToken ??
      (typeof window !== "undefined"
        ? new URL(window.location.href).searchParams.get(SCUTE_MAGIC_PARAM)
        : null)
  );

  useEffect(() => {
    setIsPolling(Boolean(magicLinkId));
  }, [magicLinkId]);

  useInterval(
    async () => {
      if (magicLinkId) {
        const { data: payload, error: magicLinkIdLoginError } =
          await scuteClient.getMagicLinkStatus(magicLinkId);

        if (!magicLinkIdLoginError) {
          setIsPolling(false);
          handleLogin(payload);
        }
      }
    },
    isPolling && magicLinkToken === null ? 5000 : null
  );

  const handleLogin = async (payload: ScuteTokenPayload) => {
    const { error: signInError } = await scuteClient.signInWithTokenPayload(
      payload
    );

    if (signInError) {
      const { isFatal, message: errorMsg } = getMeaningfulError(signInError);
      setIsFatalError?.(isFatal);
      setError(errorMsg);
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
        const { isFatal, message: errorMsg } = getMeaningfulError(verifyError);
        setIsFatalError?.(isFatal);
        setError(errorMsg);
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
            ? "This is a new device, to remember it we need to register it first"
            : "Check your email to login"}
        </Heading>
        <Text size="2" css={{ color: "$textColor", mb: "$1" }}>
          {`We’ve sent an email to your inbox with`} <br />a one-time link.
        </Text>
        <Text size="2">
          You will be automatically signed in here once you click that link.
        </Text>
        <Flex css={{ jc: "center", py: "$5" }}>
          <Badge size="1">{identifier}</Badge>
        </Flex>
        <Flex css={{ jc: "space-between" }}>
          <Button
            variant="alt"
            onClick={() => setAuthView(VIEWS.SIGN_IN_OR_UP)}
          >
            Change email
          </Button>
          <Button variant="alt" disabled>
            Resend email
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
              We are logging you in
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
                Back to login
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
