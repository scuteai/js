import { styled, keyframes } from "../stitches.config";
import { Flex } from "./Flex";
import { SpinnerIcon } from "../assets/icons";
import type { ReactElement } from "react";

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

export const LargeSpinner = (props: {
  icon?: ReactElement;
  spinnerColor?: string;
}) => {
  const { spinnerColor, icon } = props;
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
        {icon}
      </Flex>
      <Holder css={{ position: "absolute" }}>
        <SpinnerIcon color={spinnerColor} />
      </Holder>
    </Flex>
  );
};
