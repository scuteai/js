import { useTranslation } from "react-i18next";

import { EmailIcon, FatalErrorIcon } from "../assets/icons";
import {
  Badge,
  Flex,
  Button,
  Header,
  Heading,
  Inner,
  Text,
  QueryContainer,
  ResponsiveContainer,
  ResponsiveLeft,
  ResponsiveRight,
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
    <QueryContainer>
      <ResponsiveContainer>
        <ResponsiveLeft>
          <Header css={{ jc: "center" }}>
            <FatalErrorIcon color="var(--scute-colors-errorColor)" />
          </Header>
          <Inner
            css={{
              display: "flex",
              jc: "center",
              fd: "column",
              textAlign: "center",
              "@container queryContainer (min-width: 950px)": {
                ta: "left",
              },
            }}
          >
            <Heading size="4">
              {error ?? t("general.somethingWentWrong")}
            </Heading>
            <Text size="2" css={{ color: "$errorColor", mb: "$1" }}>
              {t("general.pleaseTryAgain")}
            </Text>
            <Flex css={{ jc: "center", py: "$5", ta: "center" }}>
              {identifier && (
                <Badge size="1">
                  <EmailIcon
                    color="var(--scute-colors-svgIconColor)"
                    style={{ height: "14px", opacity: 0.5, marginRight: 8 }}
                  />
                  {identifier}
                </Badge>
              )}
            </Flex>
          </Inner>
        </ResponsiveLeft>
        <ResponsiveRight>
          <Inner
            css={{
              display: "flex",
              jc: "center",
              fd: "column",
              textAlign: "center",
              height: "100%",
            }}
          >
            <Flex css={{ jc: "center" }}>
              <Button
                variant="alt"
                size="2"
                onClick={() => {
                  tryAgain();
                }}
                css={{
                  "@container queryContainer (min-width: 950px)": {
                    mt: "$7",
                  },
                }}
              >
                {t("general.tryAgain")}
              </Button>
            </Flex>
          </Inner>
        </ResponsiveRight>
      </ResponsiveContainer>
    </QueryContainer>
  );
};

export default FatalErrorView;
