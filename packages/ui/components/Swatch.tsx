import { styled, CSS } from "../stitches.config";
import * as ToggleGroup from "@radix-ui/react-toggle-group";

const swatchCss: CSS = {
  all: "unset",
  boxSizing: "border-box",
  userSelect: "none",
  "&::before": {
    boxSizing: "border-box",
  },
  "&::after": {
    boxSizing: "border-box",
  },
  cursor: "pointer",
  borderRadius: "$3",
  background: "#ccc",
  display: "flex",
  ai: "center",
  jc: "center",
  overflow: "hidden",
  transition: "all .2s ease",
  position: "relative",
  zIndex: 5,
  "&:before": {
    content: "",
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    bc: "rgba(0,0,0,0.05)",
    borderRadius: "$round",
  },
  "&:hover": {
    boxShadow: "0 0 0 4px rgba(0,0,0,0.1)",
    "&:before": {
      bc: "rgba(0,0,0,0.0)",
    },
  },
  "&:focus": {
    boxShadow: "inset 0 0 0 2px white, 0 0 0 3px var(--shadowBg)",
  },
  "&:disabled": {
    opacity: "20%",
  },
  '&[data-state="on"]': {
    boxShadow: "inset 0 0 0 2px white, 0 0 0 3px var(--shadowBg)",
  },
  variants: {
    size: {
      0: {
        height: "$4",
        width: "$4",
        borderRadius: "$1",
      },
      1: {
        height: "$5",
        width: "$5",
      },
      2: {
        height: "36px",
        width: "36px",
      },
      3: {
        height: "$7",
        width: "$7",
      },
    },
    variant: {
      transparentColor: {
        backgroundImage:
          "linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)",
        backgroundSize: "20px 20px",
        backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
      },
      previewOnly: {
        bc: "rgba(0,0,0,0.0)",
        "&:hover": {
          boxShadow: "none",
        },
      },
      rainbow: {
        background:
          "linear-gradient(0deg, #b827fc 0%, #2c90fc 25%, #b8fd33 50%, #fec837 75%, #fd1892 100%)",
        "&:after": {
          position: "absolute",
          width: "28px",
          height: "28px",
          content: "",
          left: "4px",
          top: "4px",
          borderRadius: "$round",
          bc: "white",
          display: "block",
          zIndex: "0",
        },
        "&:hover": {
          background:
            "linear-gradient(145deg, #b827fc 0%, #2c90fc 25%, #b8fd33 50%, #fec837 75%, #fd1892 100%)",
        },
      },
    },
  },
  defaultVariants: {
    size: 2,
  },
};

export const SwatchToggleHolder = styled(ToggleGroup.Root, {
  display: "flex",
  gap: "$3",
  flexWrap: "wrap",
  rowGap: "$2",
  jc: "flex-start",
});

export const SwatchToggleItem = styled(ToggleGroup.Item, swatchCss);

export const Swatch = styled("button", swatchCss);
export const FakeSwatch = styled("div", swatchCss);
export const SwatchButton = styled("div", {
  bc: "$gray1",
  height: "64px",
  borderRadius: "$3",
  border: "1px solid $colors$gray3",
  display: "flex",
  ai: "center",
  jc: "space-between",
  fontSize: "$2",
  px: "$2",
  width: "100%",
});

export const SwatchStack = styled("div", {
  display: "flex",
  position: "relative",
  [`& ${Swatch}`]: {
    marginRight: "-3px",
  },
});
