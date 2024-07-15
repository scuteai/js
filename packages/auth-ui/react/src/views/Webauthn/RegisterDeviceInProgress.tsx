import { useTranslation } from "react-i18next";

import { BiometricsIcon } from "../../assets/icons";
import {
  Badge,
  Flex,
  Header,
  Heading,
  Inner,
  LargeSpinner,
} from "../../components";
import { CommonViewProps } from "../common";

const RegisterDeviceInProgress = ({ identifier }: CommonViewProps) => {
  const { t } = useTranslation();
  return (
    <>
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
        <Heading size="1">{t("registerDevice.registerInProgress")}</Heading>

        <Flex css={{ jc: "center", py: "$5" }}>
          <Badge size="1">{identifier}</Badge>
        </Flex>
        <Flex css={{ jc: "space-around" }}>
          <LargeSpinner />
        </Flex>
      </Inner>
    </>
  );
};

export default RegisterDeviceInProgress;
