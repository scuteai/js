import { styled, keyframes } from "../stitches.config";
import { Flex } from "./Flex";
import { EmailIcon } from "../assets/icons";
import { SpinnerIcon } from "../assets/icons";

const spin = keyframes({
  "0%": { transform: "rotate(0deg)" },
  "100%": { transform: "rotate(360deg)" },
});

const Holder = styled("div", {
  "& svg": {
    width: "70px",
    height: "auto",
  },
  animation: `${spin} 1s infinite linear`,
});

export const LargeSpinner = (props: any) => {
  const { iconColor, spinnerColor } = props;
  return (
    <Flex
      css={{
        position: "relative",
        width: "100%",
        jc: "center",
        height: "90px",
      }}
    >
      <Flex css={{ width: "24px", marginTop: "24px", position: "absolute" }}>
        <EmailIcon color={iconColor} />
      </Flex>
      <Holder css={{ position: "absolute" }}>
        <SpinnerIcon color={spinnerColor} />
      </Holder>
    </Flex>
  );
};
