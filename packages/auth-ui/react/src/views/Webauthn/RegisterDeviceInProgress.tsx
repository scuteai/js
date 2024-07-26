import {
  BiometricAltIcon,
  BiometricsIcon,
  EmailIcon,
  FaceIdIcon,
} from "../../assets/icons";
import {
  Badge,
  Flex,
  Heading,
  Inner,
  QueryContainer,
  ResponsiveContainer,
  ResponsiveLeft,
  ResponsiveRight,
  Text,
} from "../../components";
import { CommonViewProps } from "../common";
import { useEffect } from "react";
import { t } from "i18next";

const RegisterDeviceInProgress = ({
  identifier,
  setIslandProps,
  resetIslandProps,
}: CommonViewProps) => {
  useEffect(() => {
    setIslandProps &&
      setIslandProps({
        label: t("registerDevice.registeringDevice"),
        active: true,
        Icon: <FaceIdIcon />,
      });
    return () => {
      resetIslandProps && resetIslandProps();
    };
  }, []);
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
              "@container queryContainer (min-width: 950px)": {
                ta: "left",
              },
            }}
          >
            <Heading size="4">{t("general.pleaseWait")}</Heading>
            <Text size="2" css={{ mb: "$4" }}>
              {t("registerDevice.registerInProgress")}
            </Text>

            <Flex
              css={{
                py: "$5",
                ai: "center",
                jc: "center",
                "@container queryContainer (min-width: 950px)": {
                  display: "none",
                },
              }}
            >
              <BiometricsIcon color="var(--scute-colors-svgIconMutedColor)" />
            </Flex>
            {identifier && (
              <Flex css={{ jc: "center", py: "$5" }}>
                <Badge size="1" css={{ color: "$panelText" }}>
                  <EmailIcon
                    color="var(--scute-colors-panelText)"
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
              "@container queryContainer (max-width: 949px)": {
                display: "none",
              },
            }}
          >
            <BiometricAltIcon color="var(--scute-colors-svgIconMutedColor)" />
          </Flex>
        </ResponsiveRight>
      </ResponsiveContainer>
    </QueryContainer>
  );
};

export default RegisterDeviceInProgress;
