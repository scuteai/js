import { styled, keyframes, VariantProps, CSS } from "../stitches.config";
import React, { forwardRef } from "react";

type SpinnerSizeVariants = "small" | "medium" | "large";
type SpinnerColorVariants = "gray" | "blue" | "green" | "red" | "purple";
type SpinnerVariants = {
  size: SpinnerSizeVariants;
  color: SpinnerColorVariants;
};
type SpinnerProps = SpinnerVariants & { css?: CSS; as?: any };

// eslint-disable-next-line react/display-name
export const Spinner = React.forwardRef<SpinnerProps>((props, forwardedRef) => {
  const { size = "small", color } = props as SpinnerProps;
  return (
    <SpinnerIcon size={size} variant={color}>
      <Container>
        {[...new Array(12)].map((_, index) => (
          <span key={`spinner-${index}`}></span>
        ))}
      </Container>
    </SpinnerIcon>
  );
});
const Container = styled("div", {
  width: "100%",
  height: "100%",
  position: "relative",
  left: "50%",
  top: "50%",
});

const spinnerAnimation = keyframes({
  "0%": { opacity: 1 },
  "100%": { opacity: 0.15 },
});

const SpinnerIcon = styled("div", {
  display: "block",
  boxSizing: "border-box",
  width: "30px",
  height: "30px",
  padding: "1px",
  margin: "1px",
  variants: {
    size: {
      small: {
        width: "$4",
        height: "$4",
      },
      medium: {
        width: "$5",
        height: "$5",
      },
      large: {
        width: "$6",
        height: "$6",
      },
    },
    variant: {
      gray: {
        "& span": {
          backgroundColor: "$gray9",
        },
      },
      blue: {
        "& span": {
          backgroundColor: "$blue8",
        },
      },
      green: {
        "& span": {
          backgroundColor: "$green8",
        },
      },
      red: {
        "& span": {
          backgroundColor: "$red8",
        },
      },
      purple: {
        "& span": {
          backgroundColor: "$purple8",
        },
      },
    },
  },
  "& span": {
    backgroundColor: "$hiContrast",
    position: "absolute",
    top: "-3.9%",
    width: "24%",
    height: "8%",
    left: "-10%",
    borderRadius: "$radius",
    animation: `${spinnerAnimation} 1.2s linear 0s infinite normal none running`,
  },
  "& span:nth-child(1)": {
    animationDelay: "-1.2s",
    transform: "rotate(0deg) translate(146%)",
  },
  "& span:nth-child(2)": {
    animationDelay: "-1.1s",
    transform: "rotate(30deg) translate(146%)",
  },
  "& span:nth-child(3)": {
    animationDelay: "-1s",
    transform: "rotate(60deg) translate(146%)",
  },
  "& span:nth-child(4)": {
    animationDelay: "-0.9s",
    transform: "rotate(90deg) translate(146%)",
  },
  "& span:nth-child(5)": {
    animationDelay: "-0.8s",
    transform: "rotate(120deg) translate(146%)",
  },
  "& span:nth-child(6)": {
    animationDelay: "-0.7s",
    transform: "rotate(150deg) translate(146%)",
  },
  "& span:nth-child(7)": {
    animationDelay: "-0.6s",
    transform: "rotate(180deg) translate(146%)",
  },
  "& span:nth-child(8)": {
    animationDelay: "-0.5s",
    transform: "rotate(210deg) translate(146%)",
  },
  "& span:nth-child(9)": {
    animationDelay: "-0.4s",
    transform: "rotate(240deg) translate(146%)",
  },
  "& span:nth-child(10)": {
    animationDelay: "-0.3s",
    transform: "rotate(270deg) translate(146%)",
  },
  "& span:nth-child(11)": {
    animationDelay: "-0.2s",
    transform: "rotate(300deg) translate(146%)",
  },
  "& span:nth-child(12)": {
    animationDelay: "-0.1s",
    transform: "rotate(330deg) translate(146%)",
  },
});

export default Spinner;
