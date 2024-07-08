import { useTranslation } from "react-i18next";

import { BiometricsIcon, DeadPCIcon } from "../assets/icons";
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
  const { t } = useTranslation();

  return (
    <>
      <Header css={{ mb: "$4", mt: "$4", jc: "center" }}>
        <DeadPCIcon color="var(--scute-colors-accent)" />
      </Header>
      <Inner
        css={{
          display: "flex",
          jc: "center",
          fd: "column",
          textAlign: "center",
        }}
      >
        <Heading size="4">{error ?? t("general.somethingWentWrong")}</Heading>
        <Text size="2" css={{ color: "$errorColor", mb: "$1" }}>
          {t("general.pleaseTryAgain")}
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
            {t("general.tryAgain")}
          </Button>
        </Flex>
      </Inner>
    </>
  );
};

export default FatalErrorView;
