import { type ScuteError } from "@scute/react";
import { VIEWS } from "@scute/ui-shared";
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

interface ErrorViewProps extends Omit<CommonViewProps, "error"> {
  error: ScuteError | null;
  setError: (error: ScuteError | null) => void;
}

const ErrorView = ({ identifier, error, setError, setAuthView }: ErrorViewProps) => {
  // only fatal errors
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
          <Badge size="1">{identifier}</Badge>
        </Flex>
        <Flex css={{ jc: "center" }}>
          <Button
            variant="alt"
            size="2"
            onClick={() => {
              setAuthView(VIEWS.SIGN_IN_OR_UP);
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

export default ErrorView;
