import { styled } from "../stitches.config";

export const Icon = styled("div", {
  // Reset
  alignItems: "center",
  appearance: "none",
  borderWidth: "0",
  boxSizing: "border-box",
  display: "inline-flex",
  flexShrink: 0,
  fontFamily: "inherit",
  fontSize: "14px",
  justifyContent: "center",
  lineHeight: "1",
  outline: "none",
  padding: "0",
  textDecoration: "none",
  userSelect: "none",
  "&::before": {
    boxSizing: "border-box",
  },
  "&::after": {
    boxSizing: "border-box",
  },
  backgroundColor: "$gray5",
  color: "$gray9",
  variants: {
    size: {
      "1": {
        borderRadius: "$1",
        height: "$5",
        width: "$5",
        "& svg": {
          width: "16px",
          height: "auto",
        },
      },
      "2": {
        borderRadius: "$2",
        height: "$6",
        width: "$6",
      },
      "3": {
        borderRadius: "$5",
        height: "$7",
        width: "$7",
      },
      "4": {
        borderRadius: "$5",
        height: "$8",
        width: "$8",
      },
    },
    variant: {
      blue: {
        background: "$blue9",
        color: "white",
      },
      cyan: {
        background: "$cyan5",
        color: "white",
      },
      plum: {
        background: "$plum9",
        color: "white",
      },
      purple: {
        background: "$purple9",
        color: "white",
      },
      violet: {
        background: "$violet9",
        color: "white",
      },
      green: {
        background: "$green9",
        color: "white",
      },
      mint: {
        background: "$mint9",
        color: "white",
      },
      indigo: {
        background: "$indigo9",
        color: "white",
      },
    },
  },
  defaultVariants: {
    size: "2",
  },
});
