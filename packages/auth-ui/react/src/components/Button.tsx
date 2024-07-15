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
  position: "relative",
  "@bp1": {
    fontSize: "$2",
  },

  backgroundColor: "$buttonIdleBg",
  color: "$buttonIdleText",
  boxShadow: shadowCreator(
    "initial",
    "$colors$buttonIdleBorder",
    "$colors$buttonIdleShadow",
    "$colors$buttonIdleShadow",
    "$colors$buttonIdleShadow",
    "$colors$buttonIdleShadow"
  ),

  "& svg": {
    position: "absolute",
    left: "$4",
    width: "34px",
  },
  //border:string, ring1:string, ring2:string, bottom1:string, bottom2:string)
  "&:hover": {
    backgroundColor: "$buttonHoverBg",
    color: "$buttonHoverText",
    boxShadow: shadowCreator(
      "focus",
      "$colors$buttonHoverBorder",
      "$colors$buttonHoverShadow",
      "$colors$buttonHoverShadow",
      "$colors$buttonHoverShadow",
      "$colors$buttonHoverShadow"
    ),
  },
  "&:focus": {
    backgroundColor: "$buttonHoverBg",
    color: "$buttonHoverText",
    boxShadow: shadowCreator(
      "focus",
      "$colors$buttonFocusBorder",
      "$colors$buttonFocusShadow",
      "$colors$buttonFocusShadow",
      "$colors$buttonFocusShadow",
      "$colors$buttonFocusShadow"
    ),
  },
  "&:active": {
    backgroundColor: "$buttonHoverBg",
    color: "$buttonHoverText",
    transform: "scale(0.99)",
    boxShadow: shadowCreator(
      "initial",
      "$colors$buttonFocusBorder",
      "$colors$buttonFocusShadow",
      "$colors$buttonFocusShadow",
      "$colors$buttonFocusShadow",
      "$colors$buttonFocusShadow"
    ),
  },
  "&:disabled": {
    backgroundColor: "$buttonPassiveBg",
    color: "$buttonPassiveText",
    pointerEvents: "none",
    "& svg": {
      opacity: "0.3",
    },
  },

  variants: {
    size: {
      "1": {
        borderRadius: "$3",
        height: "$9",
        px: "$4",
        fontSize: "$2",
        lineHeight: "$sizes$5",
      },
      "2": {
        borderRadius: "$4",
        height: "$10",
        px: "$3",
        fontSize: "$4",
        lineHeight: "$sizes$6",
        width: "100%",
      },
    },

    //(state:string, border:string, ring1:string, ring2:string, bottom1:string, bottom2:string)

    //

    variant: {
      alt: {
        backgroundColor: "$buttonAltIdleBg",
        color: "$buttonAltIdleText",
        boxShadow: shadowCreator(
          "initial",
          "$colors$buttonAltIdleBorder",
          "$colors$buttonAltIdleShadow",
          "$colors$buttonAltIdleShadow",
          "$colors$buttonAltIdleShadow",
          "$colors$buttonAltIdleShadow"
        ),
        "&:hover": {
          backgroundColor: "$buttonAltHoverBg",
          color: "$buttonAltHoverText",
          boxShadow: shadowCreator(
            "focus",
            "$colors$buttonAltHoverBorder",
            "$colors$buttonAltHoverShadow",
            "$colors$buttonAltHoverShadow",
            "$colors$buttonAltHoverShadow",
            "$colors$buttonAltHoverShadow"
          ),
        },
        "&:focus": {
          backgroundColor: "$buttonAltHoverBg",
          color: "$buttonAltHoverText",
          boxShadow: shadowCreator(
            "focus",
            "$colors$buttonAltFocusBorder",
            "$colors$buttonAltFocusShadow",
            "$colors$buttonAltFocusShadow",
            "$colors$buttonAltFocusShadow",
            "$colors$buttonAltFocusShadow"
          ),
        },
        "&:active": {
          backgroundColor: "$buttonAltHoverBg",
          color: "$buttonAltHoverText",
          boxShadow: shadowCreator(
            "initial",
            "$colors$buttonAltFocusBorder",
            "$colors$buttonAltFocusShadow",
            "$colors$buttonAltFocusShadow",
            "$colors$buttonAltFocusShadow",
            "$colors$buttonAltFocusShadow"
          ),
        },
      },
      social: {
        backgroundColor: "$buttonSocialIdleBg",
        color: "$buttonSocialIdleText",
        boxShadow: shadowCreator(
          "initial",
          "$colors$buttonSocialIdleBorder",
          "$colors$buttonSocialIdleShadow",
          "$colors$buttonSocialIdleShadow",
          "$colors$buttonSocialIdleShadow",
          "$colors$buttonSocialIdleShadow"
        ),
        "&:hover": {
          backgroundColor: "$buttonSocialHoverBg",
          color: "$buttonSocialHoverText",
          boxShadow: shadowCreator(
            "focus",
            "$colors$buttonSocialHoverBorder",
            "$colors$buttonSocialHoverShadow",
            "$colors$buttonSocialHoverShadow",
            "$colors$buttonSocialHoverShadow",
            "$colors$buttonSocialHoverShadow"
          ),
        },
        "&:focus": {
          backgroundColor: "$buttonSocialHoverBg",
          color: "$buttonSocialHoverText",
          boxShadow: shadowCreator(
            "focus",
            "$colors$buttonSocialFocusBorder",
            "$colors$buttonSocialFocusShadow",
            "$colors$buttonSocialFocusShadow",
            "$colors$buttonSocialFocusShadow",
            "$colors$buttonSocialFocusShadow"
          ),
        },
        "&:active": {
          backgroundColor: "$buttonSocialHoverBg",
          color: "$buttonSocialHoverText",
          boxShadow: shadowCreator(
            "initial",
            "$colors$buttonSocialFocusBorder",
            "$colors$buttonSocialFocusShadow",
            "$colors$buttonSocialFocusShadow",
            "$colors$buttonSocialFocusShadow",
            "$colors$buttonSocialFocusShadow"
          ),
        },
      },
    },
  },
  defaultVariants: {
    size: 1,
  },
});
