import {
  Badge,
  Flex,
  Header,
  Heading,
  Inner,
  LargeSpinner,
  Text,
} from "../../components";
import { CommonViewProps } from "../common";

export interface MagicLoadingProps extends CommonViewProps {
  resendAllowed: boolean;
  resendEmail: () => void;
}

const MagicLoading = ({ identifier }: MagicLoadingProps) => (
  <>
    <Header css={{ mb: "$1" }}>
      <LargeSpinner
        iconColor="var(--scute-colors-contrast8)"
        spinnerColor="green"
      />
    </Header>
    <Inner
      css={{ display: "flex", jc: "center", fd: "column", textAlign: "center" }}
    >
      <Heading size="1" css={{ color: "$headingColor" }}>
        We are logging you in
      </Heading>
      <Text size="2" css={{ color: "$textColor", mb: "$1" }}></Text>
      <Flex css={{ jc: "center", py: "$5" }}>
        <Badge size="1">{identifier}</Badge>
      </Flex>
    </Inner>
  </>
);

export default MagicLoading;
