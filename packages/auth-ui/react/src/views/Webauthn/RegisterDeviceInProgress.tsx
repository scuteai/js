import { useTranslation } from "react-i18next";

import {
  BiometricAltIcon,
  BiometricsIcon,
  EmailIcon,
} from "../../assets/icons";
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
          <Inner
            css={{
              display: "flex",
              jc: "center",
              fd: "column",
              ta: "center",
              alignItems: "center",
            }}
          >
            <Heading size="4">{t("general.pleaseWait")}</Heading>
            <Text size="2" css={{ mb: "$4" }}>
              {t("registerDevice.registerInProgress")}
            </Text>

            <Flex
              css={{
                py: "$5",
                "@container queryContainer (min-width: 800px)": {
                  display: "none",
                },
              }}
            >
              <BiometricsIcon color="var(--scute-colors-surfaceBg)" />
            </Flex>
            {identifier && (
              <Flex css={{ jc: "center", py: "$5" }}>
                <Badge size="1">
                  <EmailIcon
                    color="var(--scute-colors-svgIconColor)"
                    style={{ height: "14px", opacity: 0.5, marginRight: 8 }}
                  />
                  {identifier}
                </Badge>
              </Flex>
            )}
          </Inner>
        </ResponsiveLeft>
        <ResponsiveRight>
          <Flex
            css={{
              jc: "space-around",
              alignItems: "center",
              height: "100%",
              "@container queryContainer (max-width: 799px)": {
                display: "none",
              },
            }}
          >
            <BiometricAltIcon color="var(--scute-colors-surfaceBg)" />
          </Flex>
        </ResponsiveRight>
      </ResponsiveContainer>
    </QueryContainer>
  );
};

export default RegisterDeviceInProgress;
