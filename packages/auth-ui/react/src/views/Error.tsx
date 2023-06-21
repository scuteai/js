import { VIEWS } from "@scute/auth-ui-shared";
import { useEffect } from "react";
import { BiometricsIcon } from "../assets/icons";
import {
  Badge,
  Flex,
  Button,
  Header,
  Heading,
  Inner,
  Text,
} from "../components";
import type { CommonViewProps } from "./common";

interface ErrorProps extends CommonViewProps {
  error: any;
  setError: (error: any) => void;
}

const Error = ({ email, error, setError, setAuthView }: ErrorProps) => {
  useEffect(() => {
    console.log(error);
  }, [error]);

  return (
    <>
      <Header>
        <BiometricsIcon color="var(--scute-colors-errorColor)" />
      </Header>
      <Inner
        css={{
          display: "flex",
          jc: "center",
          fd: "column",
          textAlign: "center",
        }}
      >
        <Heading size="1" css={{ color: "$errorColor" }}>
          Something went wrong
        </Heading>
        <Text size="2" css={{ color: "$errorColor", mb: "$1" }}>
          Please try again
        </Text>
        <Flex css={{ jc: "center", py: "$5" }}>
          <Badge size="1">{email}</Badge>
        </Flex>
        <Flex css={{ jc: "center" }}>
          <Button
            variant="alt"
            size="2"
            onClick={() => {
              setAuthView(VIEWS.LOGIN);
              setError(null);
            }}
          >
            Try again
          </Button>
        </Flex>
      </Inner>
    </>
  );
};

export default Error;
