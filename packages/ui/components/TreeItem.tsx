import { styled, shadowCreator } from "../stitches.config";

export const TreeItemsContainer = styled("div", {
  display: "flex",
  fd: "column",
  gap: "3px",
  px: "$2",
});

export const TreeSectionTitle = styled("div", {
  fontSize: "$1",
  px: "$1",
  color: "$gray9",
  display: "flex",
  jc: "space-between",
  ai: "center",
  fontWeight: "500",
  height: "32px",
});

export const TreeSeparator = styled("div", {
  height: "2px",
  width: "100%",
  borderBottom: "1px solid $colors$gray5",
});

export const TreeItemAction = styled("div", {
  opacity: "0",
  transition: "all .2s ease-in",
});

export const TreeItem = styled("div", {
  // Reset
  alignItems: "center",
  boxSizing: "border-box",
  display: "flex",
  ai: "center",
  gap: "$3",
  lineHeight: "1",
  fontWeight: "500",
  userSelect: "none",
  width: "100%",
  borderRadius: "$2",
  WebkitTapHighlightColor: "transparent",
  transition: "all .3s ease",

  "&:disabled": {
    pointerEvents: "none",
  },
  "&::before": {
    boxSizing: "border-box",
  },
  "&::after": {
    boxSizing: "border-box",
  },

  // Custom
  cursor: "pointer",
  height: "30px",
  px: "$2",
  fontSize: "$2",
  color: "$gray11",

  '&.active, &[data-active="true"]': {
    backgroundColor: "$compActive",
    color: "$loContrast",
    boxShadow: shadowCreator(
      "initial",
      "$colors$gray4",
      "$colors$indigo9",
      "$colors$indigo9",
      "rgba(0,0,0,0)",
      "rgba(0,0,0,0)"
    ),
    "& span": {
      color: "$loContrast",
    },
  },

  "&:hover": {
    backgroundColor: "$highlight",
    color: "$gray12",
    boxShadow: shadowCreator(
      "initial",
      "$colors$gray4",
      "$colors$indigo9",
      "$colors$indigo9",
      "rgba(0,0,0,0)",
      "rgba(0,0,0,0)"
    ),
    [`& ${TreeItemAction}`]: {
      opacity: 1,
    },
  },
  variants: {
    size: {
      "1": {
        fontSize: "$1",
      },
      "2": {
        fontSize: "$2",
      },
    },
    transparent: {
      true: {
        "&:hover": {
          backgroundColor: "rgba(255,255,255,0.4)",
          filter: "backgroundBlur(25px)",
          color: "$hiContrast",
        },
        "&.active": {
          background: "rgba(255,255,255,0.7)",
          color: "$hiContrast",
          [`& ${TreeItemAction}`]: {
            opacity: 1,
          },
          "&:hover": {
            background: "rgba(255,255,255,0.7)",
          },
        },
      },
    },
    variant: {},
  },
});
