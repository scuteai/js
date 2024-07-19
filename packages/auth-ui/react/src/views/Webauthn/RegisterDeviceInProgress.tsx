import { useTranslation } from "react-i18next";

import { BiometricsIcon } from "../../assets/icons";
import {
  Badge,
  Flex,
  Header,
  Heading,
  Inner,
  LargeSpinner,
  QueryContainer,
  ResponsiveContainer,
  ResponsiveLeft,
  ResponsiveRight,
} from "../../components";
import { CommonViewProps } from "../common";

const RegisterDeviceInProgress = ({ identifier }: CommonViewProps) => {
  const { t } = useTranslation();
  return (
    <QueryContainer>
      <ResponsiveContainer>
        <ResponsiveLeft>
          <Header css={{ textAlign: "center", mb: "$5", jc: "center" }}>
            <BiometricsIcon color="var(--scute-colors-svgIconColor)" />
          </Header>
          <Inner
            css={{
              display: "flex",
              jc: "center",
              fd: "column",
            }}
          >
            <Heading size="4">Please Wait</Heading>
            <Heading size="1">{t("registerDevice.registerInProgress")}</Heading>

            <Flex css={{ jc: "center", py: "$5" }}>
              <Badge size="1">{identifier}</Badge>
            </Flex>
          </Inner>
        </ResponsiveLeft>
        <ResponsiveRight>
          <Flex
            css={{ jc: "space-around", alignItems: "center", height: "100%" }}
          >
            <LargeSpinner />
          </Flex>
        </ResponsiveRight>
      </ResponsiveContainer>
    </QueryContainer>
  );
};

export default RegisterDeviceInProgress;
