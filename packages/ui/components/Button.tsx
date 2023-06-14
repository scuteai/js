import { styled, shadowCreator } from "../stitches.config";

export const ResetButton = styled("button", {
  all: "unset",
  alignItems: "center",
  boxSizing: "border-box",
  userSelect: "none",
  "&::before": {
    boxSizing: "border-box",
  },
  "&::after": {
    boxSizing: "border-box",
  },
});

//(state:string, border:string, ring1:string, ring2:string, bottom1:string, bottom2:string)
export const Button = styled("button", {
  // Reset
  all: "unset",
  alignItems: "center",
  boxSizing: "border-box",
  userSelect: "none",
  "&::before": {
    boxSizing: "border-box",
  },
  "&::after": {
    boxSizing: "border-box",
  },
  transition: "all .2s ease-in-out",
  // Custom reset?
  display: "inline-flex",
  gap: "$1",
  flexShrink: 0,
  justifyContent: "center",
  lineHeight: "1",
  WebkitTapHighlightColor: "rgba(0,0,0,0)",
  cursor: "pointer",
  // Custom
  height: "$5",
  px: "$2",
  fontFamily: "$main",
  fontSize: "$1",
  fontWeight: "500",
  fontVariantNumeric: "tabular-nums",
  borderRadius: "$2",
  "@bp1": {
    fontSize: "$2",
  },
  "&:disabled": {
    backgroundColor: "$slate2",
    boxShadow: "inset 0 0 0 1px $colors$slate7",
    color: "$slate8",
    pointerEvents: "none",
  },

  backgroundColor: "white",
  color: "$gray11",
  boxShadow: shadowCreator(
    "initial",
    "$colors$gray5",
    "$colors$indigo9",
    "$colors$indigo9",
    "rgba(0,0,0,0)",
    "rgba(0,0,0,0)"
  ),
  "&:hover": {
    backgroundColor: "$gray1",
    boxShadow: shadowCreator(
      "initial",
      "$colors$gray7",
      "$colors$gray7",
      "$colors$gray7",
      "rgba(0,0,0,0)",
      "rgba(0,0,0,0)"
    ),
  },
  "&:focus": {
    boxShadow: shadowCreator(
      "focus",
      "$colors$cyan6",
      "$colors$cyan5",
      "$colors$cyan5",
      "rgba(0,0,0,0)",
      "rgba(0,0,0,0)"
    ),
  },
  "&:active": {
    background: "$gray2",
  },

  variants: {
    size: {
      "0": {
        borderRadius: "$3",
        height: "$5",
        px: "$2",
        fontSize: "$1",
        lineHeight: "$sizes$5",
      },
      "1": {
        borderRadius: "$3",
        height: "$6",
        px: "$2",
        fontSize: "$2",
        lineHeight: "$sizes$5",
      },
      "2": {
        borderRadius: "$3",
        height: "$7",
        px: "$3",
        fontSize: "$2",
        lineHeight: "$sizes$6",
      },
      "3": {
        borderRadius: "$3",
        height: "$8",
        px: "$5",
        fontSize: "$3",
        lineHeight: "$sizes$7",
      },
    },

    variant: {
      primary: {
        backgroundColor: "$indigo9",
        color: "white",
        boxShadow: shadowCreator(
          "initial",
          "$colors$indigo9",
          "$colors$indigo9",
          "$colors$indigo9",
          "rgba(9, 11, 20, 0.12)",
          "rgba(9, 11, 20, 0.18)"
        ),
        "&:hover": {
          backgroundColor: "$indigo11",
          boxShadow: shadowCreator(
            "initial",
            "$colors$indigo11",
            "$colors$indigo5",
            "$colors$indigo9",
            "rgba(9, 11, 20, 0.12)",
            "rgba(9, 11, 20, 0.18)"
          ),
        },
        "&:focus": {
          boxShadow: shadowCreator(
            "focus",
            "$colors$indigo9",
            "$colors$indigo7",
            "$colors$indigo7",
            "rgba(9, 11, 20, 0.12)",
            "rgba(9, 11, 20, 0.18)"
          ),
        },
        "&:active": {
          background: "$indigo12",
        },
      },
      secondary: {
        backgroundColor: "white",
        color: "$gray12",
        boxShadow: shadowCreator(
          "initial",
          "$colors$gray6",
          "$colors$gray7",
          "$colors$indigo9",
          "rgba(9, 11, 20, 0.12)",
          "rgba(9, 11, 20, 0.18)"
        ),
        "&:hover": {
          backgroundColor: "$gray1",
          boxShadow: shadowCreator(
            "initial",
            "$colors$gray8",
            "$colors$gray8",
            "$colors$indigo9",
            "rgba(9, 11, 20, 0.12)",
            "rgba(9, 11, 20, 0.18)"
          ),
        },
        "&:focus": {
          boxShadow: shadowCreator(
            "focus",
            "$colors$indigo9",
            "$colors$yellow5",
            "$colors$indigo7",
            "rgba(9, 11, 20, 0.12)",
            "rgba(9, 11, 20, 0.18)"
          ),
        },
        "&:active": {
          background: "$gray3",
        },
      },
      tertiary: {
        backgroundColor: "$crimson6",
        color: "$crimson11",
        boxShadow: shadowCreator(
          "initial",
          "$colors$crimson8",
          "$colors$crimson6",
          "$colors$crimson9",
          "rgba(9, 11, 20, 0.12)",
          "rgba(9, 11, 20, 0.18)"
        ),
        "&:hover": {
          backgroundColor: "$crimson8",
          color: "$crimson4",
          boxShadow: shadowCreator(
            "initial",
            "$colors$crimson10",
            "$colors$crimson10",
            "$colors$indigo9",
            "rgba(9, 11, 20, 0.12)",
            "rgba(9, 11, 20, 0.18)"
          ),
        },
        "&:focus": {
          boxShadow: shadowCreator(
            "focus",
            "$colors$crimson5",
            "$colors$violet7",
            "$colors$violet6",
            "rgba(9, 11, 20, 0.12)",
            "rgba(9, 11, 20, 0.18)"
          ),
        },
        "&:active": {
          color: "$crimson4",
          background: "$crimson9",
        },
      },
      mint: {
        backgroundColor: "$mint6",
        color: "$mint11",
        boxShadow: shadowCreator(
          "initial",
          "$colors$mint8",
          "$colors$mint6",
          "$colors$mint9",
          "rgba(9, 11, 20, 0.12)",
          "rgba(9, 11, 20, 0.18)"
        ),
        "&:hover": {
          backgroundColor: "$mint8",
          color: "$mint2",
          boxShadow: shadowCreator(
            "initial",
            "$colors$mint10",
            "$colors$mint10",
            "$colors$mint12",
            "rgba(9, 11, 20, 0.12)",
            "rgba(9, 11, 20, 0.18)"
          ),
        },
        "&:focus": {
          boxShadow: shadowCreator(
            "focus",
            "$colors$mint5",
            "$colors$cyan3",
            "$colors$cyan6",
            "rgba(9, 11, 20, 0.12)",
            "rgba(9, 11, 20, 0.18)"
          ),
        },
        "&:active": {
          color: "$mint4",
          background: "$mint10",
        },
      },
      destructive: {
        backgroundColor: "$tomato1",
        color: "$tomato11",
        boxShadow: shadowCreator(
          "initial",
          "$colors$tomato7",
          "$colors$tomato7",
          "$colors$tomato7",
          "rgba(9, 11, 20, 0.12)",
          "rgba(9, 11, 20, 0.18)"
        ),
        "&:hover": {
          backgroundColor: "$tomato2",
          color: "$tomato10",
          boxShadow: shadowCreator(
            "initial",
            "$colors$tomato10",
            "$colors$tomato10",
            "$colors$tomato10",
            "rgba(9, 11, 20, 0.2)",
            "rgba(9, 11, 20, 0.18)"
          ),
        },
        "&:focus": {
          boxShadow: shadowCreator(
            "focus",
            "$colors$tomato10",
            "$colors$tomato5",
            "$colors$tomato5",
            "rgba(9, 11, 20, 0.12)",
            "rgba(9, 11, 20, 0.18)"
          ),
        },
        "&:active": {
          color: "$tomato5",
          background: "$tomato9",
        },
      },
      purple: {
        backgroundColor: "$violet9",
        color: "$violet1",
        boxShadow: shadowCreator(
          "initial",
          "$colors$violet10",
          "$colors$violet10",
          "$colors$violet10",
          "rgba(9, 11, 20, 0.12)",
          "rgba(9, 11, 20, 0.18)"
        ),
        "&:hover": {
          backgroundColor: "$violet10",
          color: "$violet2",
          boxShadow: shadowCreator(
            "initial",
            "$colors$violet12",
            "$colors$violet12",
            "$colors$violet12",
            "rgba(9, 11, 20, 0.2)",
            "rgba(9, 11, 20, 0.18)"
          ),
        },
        "&:focus": {
          boxShadow: shadowCreator(
            "focus",
            "$colors$violet8",
            "$colors$cyan7",
            "$colors$cyan7",
            "rgba(9, 11, 20, 0.12)",
            "rgba(9, 11, 20, 0.18)"
          ),
        },
        "&:active": {
          color: "$violet5",
          background: "$violet11",
        },
      },
    },
  },
  defaultVariants: {
    size: 1,
  },
});
