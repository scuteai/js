import { styled } from "../stitches.config";

const shadow1 = "0 1px 2px rgba(0, 0, 0, .1)";
const shadow2 = "0 1px 2px rgba(0, 0, 0, .1)";
const shadow3 = "0 1px 2px rgba(0, 0, 0, .1)";
const hairlineBorder =
  "0 0 0 1px transparent, 0 0 1px var(--scute-colors-contrast8)";

const hairlineBorderInset = "inset 0 0 0 red";
const focusGlow =
  "0 0 0 1px transparent, 0 0 1px #013399, 0 0 0 4px var(--scute-colors-focusColor)";
const errorGlow =
  "0 0 0 1px transparent, 0 0 1px #c84648, 0 0 0 4px var(--scute-colors-errorColor)";

export const TextField = styled("input", {
  // Reset
  appearance: "none",
  borderWidth: "1",
  borderStyle: "solid",
  borderColor: "$borderColor",
  boxSizing: "border-box",
  fontFamily: "inherit",
  fontSize: "$5",
  margin: "0",
  outline: "none",
  padding: "0",
  width: "100%",
  WebkitTapHighlightColor: "rgba(0,0,0,0)",
  transition: "all .2s ease",
  fontWeight: "normal",
  "&::before": {
    boxSizing: "border-box",
  },
  "&::after": {
    boxSizing: "border-box",
  },

  color: "$hiContrast",
  backgroundColor: "$contrast0",
  fontVariantNumeric: "tabular-nums",

  boxShadow: `0 0 0 1px transparent, ${hairlineBorder},  0 1px 2px $colors$contrast2`,

  "&:-webkit-autofill": {
    boxShadow:
      "inset 0 0 0 1px $colors$focusColor, inset 0 0 0 100px $colors$focusColorLight",
  },

  "&:-webkit-autofill::first-line": {
    color: "$hiContrast",
  },

  "&:focus": {
    backgroundColor: "$contrast0",
    boxShadow: `${focusGlow}, ${hairlineBorder}`,
    "&:-webkit-autofill": {
      boxShadow:
        "inset 0px 0px 0px 1px $colors$focusColor, 0px 0px 0px 1px $colors$focusColor, inset 0 0 0 100px $colors$focusColorLight",
    },
  },
  "&::placeholder": {
    color: "$contrast8",
  },
  "&:disabled": {
    pointerEvents: "none",
    backgroundColor: "$contrast2",
    color: "$contrast8",
    cursor: "not-allowed",
    "&::placeholder": {
      color: "$gray7",
    },
  },
  "&:read-only": {
    backgroundColor: "$contrast2",
    "&:focus": {
      boxShadow: "inset 0px 0px 0px 1px $colors$contrast7",
    },
  },

  variants: {
    size: {
      "1": {
        borderRadius: "$1",
        height: "$5",
        fontSize: "$1",
        px: "$1",
        lineHeight: "$sizes$5",
        "&:-webkit-autofill::first-line": {
          fontSize: "$1",
        },
      },
      "2": {
        borderRadius: "$4",
        height: "$10",
        fontSize: "$5",
        px: "$5",
        lineHeight: "$sizes$6",
        "&:-webkit-autofill::first-line": {
          fontSize: "$5",
        },
        "&:-webkit-autofill": {
          fontSize: "$5",
        },
      },
    },
    variant: {
      ghost: {
        boxShadow: "none",
        backgroundColor: "transparent",
        "@hover": {
          "&:hover": {
            boxShadow: "inset 0 0 0 1px $colors$contrast7",
          },
        },
        "&:focus": {
          backgroundColor: "$loContrast",
          boxShadow:
            "inset 0px 0px 0px 1px $colors$focusColor, 0px 0px 0px 1px $colors$focusColor",
        },
        "&:disabled": {
          backgroundColor: "transparent",
        },
        "&:read-only": {
          backgroundColor: "transparent",
        },
      },
    },
    state: {
      invalid: {
        boxShadow: errorGlow,
        "&:focus": {
          boxShadow: errorGlow,
        },
      },
      valid: {},
    },
    cursor: {
      default: {
        cursor: "default",
        "&:focus": {
          cursor: "text",
        },
      },
      text: {
        cursor: "text",
      },
    },
  },
  defaultVariants: {
    size: "1",
  },
});
