import { styled } from "../stitches.config";

export const Text = styled("span", {
  // Reset
  lineHeight: "1",
  margin: "0",
  fontFamily: "$main",
  fontVariantNumeric: "tabular-nums",
  display: "block",
  fontWeight: "normal",
  "& a": {
    color: "inherit",
  },
  variants: {
    size: {
      "1": {
        fontSize: "$1",
      },
      "2": {
        fontSize: "$2",
        lineHeight: "18px",
      },
      "3": {
        fontSize: "$3",
        lineHeight: "20px",
      },
      "4": {
        fontSize: "$sizes$3",
        lineHeight: "20px",
      },
      "5": {
        fontSize: "$4",
        lineHeight: "22px",
      },
      "6": {
        fontSize: "$sizes$4",
        lineHeight: "24px",
      },
    },
    variant: {
      text: {
        color: "$textColor",
      },
      contrast: {
        color: "$hiContrast",
      },
    },
    gradient: {
      true: {
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
      },
    },
  },
  defaultVariants: {
    size: "3",
    variant: "contrast",
  },
});
