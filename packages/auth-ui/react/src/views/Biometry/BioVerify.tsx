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
import { type CommonViewProps } from "../common";

interface BioVerifyProps extends CommonViewProps {
  sendMagicLink: () => void;
}

const BioVerify = ({
  scuteClient,
  identifier,
  error,
  setAuthView,
  sendMagicLink,
}: BioVerifyProps) => {
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
            An error occurred while verifying your identity. You can try again or sign in with magic link.
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
            onClick={() => setAuthView(VIEWS.SIGN_IN_OR_UP)}
          >
            Change email
          </Button>
          <Button variant="alt" onClick={() => sendMagicLink()}>
            Sign in with email link
          </Button>
        </Flex>
      </Inner>
    </>
  );
};

export default BioVerify;
