import { styled } from "../stitches.config";

export const Badge = styled("span", {
  // Reset
  alignItems: "center",
  appearance: "none",
  borderWidth: "0",
  boxSizing: "border-box",
  display: "inline-flex",
  flexShrink: 0,
  fontWeight: "normal",
  fontFamily: "inherit",
  justifyContent: "center",
  lineHeight: "1",
  verticalAlign: "middle",
  outline: "none",
  padding: "$3",
  textDecoration: "none",
  userSelect: "none",
  WebkitTapHighlightColor: "rgba(0,0,0,0)",
  "&:disabled": {
    backgroundColor: "$gray3",
    pointerEvents: "none",
    color: "$slate8",
  },
  "&::before": {
    boxSizing: "border-box",
    content: '""',
  },
  "&::after": {
    boxSizing: "border-box",
    content: '""',
  },

  // Custom
  backgroundColor: "$panelBg",
  borderRadius: "$pill",
  color: "$gray11",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
  "&:focus": {
    boxShadow: "inset 0 0 0 1px $colors$slate8, 0 0 0 1px $colors$slate8",
  },

  variants: {
    size: {
      "1": {
        height: "$5",
        px: "$2",
        fontSize: "$1",
      },
      "2": {
        height: "$5",
        px: "$2",
        fontSize: "$2",
      },
    },
    interactive: {
      true: {},
    },
  },
  defaultVariants: {
    size: "1",
  },
});
