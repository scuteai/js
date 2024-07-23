import { useTranslation } from "react-i18next";

import { BiometricsIcon, EmailIcon } from "../../assets/icons";
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
  Text,
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
              ta: "center",
            }}
          >
            <Heading size="4">{t("general.pleaseWait")}</Heading>
            <Text size="2" css={{ mb: "$4" }}>
              {t("registerDevice.registerInProgress")}
            </Text>

            <Flex css={{ jc: "center", py: "$5" }}>
              <Badge size="1">
                <EmailIcon
                  color="var(--scute-colors-svgIconColor)"
                  style={{ height: "14px", opacity: 0.5, marginRight: 8 }}
                />
                {identifier}
              </Badge>
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
