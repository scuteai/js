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

interface FatalErrorViewProps extends CommonViewProps {
  error?: string | null;
  tryAgain: () => void;
}

const FatalErrorView = ({
  identifier,
  error,
  tryAgain,
}: FatalErrorViewProps) => {
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
          {error ?? "Something went wrong"}
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
              tryAgain();
            }}
          >
            Try again
          </Button>
        </Flex>
      </Inner>
    </>
  );
};

export default FatalErrorView;
