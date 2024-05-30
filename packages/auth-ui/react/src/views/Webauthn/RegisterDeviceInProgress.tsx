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
          {t("registerDevice.registerInProgress")}
        </Heading>

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
