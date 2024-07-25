import { styled } from "../stitches.config";

const hairlineBorder =
  "0 0 0 1px transparent, 0 0 1px var(--scute-colors-inputBorder)";

const hairlineBorderInset = "inset 0 0 0 red";
const focusGlow =
  "0 0 0 1px transparent, 0 0 1px #013399, 0 0 0 4px var(--scute-colors-inputFocusGlow)";
const errorGlow =
  "0 0 0 1px transparent, 0 0 1px #c84648, 0 0 0 4px var(--scute-colors-errorColor)";

export const TextField = styled("input", {
  // Reset
  appearance: "none",
  borderWidth: "0",
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

  color: "$inputText",
  backgroundColor: "$inputBg",
  fontVariantNumeric: "tabular-nums",

  boxShadow: `0 0 0 1px transparent, ${hairlineBorder}`,

  "&:-webkit-autofill": {
    boxShadow:
      "inset 0 0 0 1px $colors$inputFocusGlow, inset 0 0 0 100px $colors$inputFocusGlow",
  },

  "&:-webkit-autofill::first-line": {
    color: "$inputText",
  },

  "&:focus": {
    boxShadow: `${focusGlow}, ${hairlineBorder}`,
    "&:-webkit-autofill": {
      boxShadow:
        "inset 0px 0px 0px 1px $colors$inputFocusGlow, 0px 0px 0px 1px $colors$inputFocusGlow, inset 0 0 0 100px $colors$inputFocusGlow",
    },
  },
  "&::placeholder": {
    color: "$inputPlaceholder",
  },
  "&:disabled": {
    pointerEvents: "none",
    backgroundColor: "$inputDisabledBg",
    color: "$inputDisabledText",
    cursor: "not-allowed",
    "&::placeholder": {
      color: "$gray7",
    },
  },
  "&:read-only": {
    backgroundColor: "$inputDisabledBg",
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
          fontSize: "$3",
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
