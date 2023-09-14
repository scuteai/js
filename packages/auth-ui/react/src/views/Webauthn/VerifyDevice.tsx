import {
  getMeaningfulError,
  NewDeviceError,
  UniqueIdentifier,
} from "@scute/core";
import { VIEWS } from "@scute/ui-shared";
import { useEffect, useState } from "react";
import { BiometricsIcon } from "../../assets/icons";

import {
  Badge,
  Button,
  Flex,
  Header,
  Heading,
  Inner,
  Text,
} from "../../components";
import useEffectOnce from "../../helpers/useEffectOnce";
import { type CommonViewProps } from "../common";

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

  const handleSendMagicLink = async (isNewDevice = false) => {
    const { data, error: sendMagicLinkError } =
      await scuteClient.sendLoginMagicLink(identifier, undefined, !isNewDevice);

    if (sendMagicLinkError) {
      const { isFatal, message: errorMsg } =
        getMeaningfulError(sendMagicLinkError);
      setIsFatalError?.(isFatal);
      setError(errorMsg);
      return;
    }

    const magicLinkId = data?.magic_link.id;
    if (magicLinkId) {
      getMagicLinkIdCallback?.(magicLinkId);
    }
  };

  const handleVerifyDevice = async () => {
    const { error: verifyDeviceError } =
      await scuteClient.signInWithVerifyDevice(identifier);

    setInitialized(true);

    if (verifyDeviceError instanceof NewDeviceError) {
      handleSendMagicLink(true);
      setAuthView(VIEWS.MAGIC_NEW_DEVICE_PENDING);
    }

    if (verifyDeviceError) {
      const { isFatal, message: errorMsg } =
        getMeaningfulError(verifyDeviceError);

      setIsFatalError?.(isFatal);
      setError(errorMsg);
    }
  };

  useEffect(() => {
    return scuteClient.onAuthStateChange((event) => {
      if (event === "webauthn_verify_start") {
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
    // TODO: loading
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
          {/* Loading... */}
        </Inner>
      </>
    );
  }

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
          Verify your identity
        </Heading>

        {error ? (
          <Text size="2" css={{ color: "$errorColor", mb: "$1" }}>
            {error}
            <br />
            You can try again or sign in with magic link.
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
          <Button
            variant="alt"
            onClick={() => {
              if (error) {
                setError(null);
                handleVerifyDevice();
              } else {
                setAuthView(VIEWS.SIGN_IN_OR_UP);
              }
            }}
          >
            {!error ? "Change email" : "Try Again"}
          </Button>
          <Button variant="alt" onClick={() => handleSendMagicLink()}>
            Sign in with email link
          </Button>
        </Flex>
      </Inner>
    </>
  );
};

export default VerifyDevice;
