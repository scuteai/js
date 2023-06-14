import React from "react";
import { styled, CSS, shadowCreator } from "../stitches.config";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Separator } from "./Separator";

export const Tabs = styled(TabsPrimitive.Root, {
  display: "flex",
  width: "100%",
  mb: "$1",
  '&[data-orientation="horizontal"]': {
    flexDirection: "column",
  },
});
const StyledTabsList = styled(TabsPrimitive.List, {
  display: "flex",
  gap: "$1",
  ai: "center",
  jc: "space-evenly",
  width: "100%",
  borderRadius: "$3",
  bc: "$gray3",
  "&:focus": {
    outline: "none",
  },
  '&[data-orientation="vertical"]': {
    flexDirection: "column",
  },
});
export const SlimStyledTabsList = styled(TabsPrimitive.List, {
  display: "flex",
  gap: "$6",
  ai: "center",
  mb: "$5",
  "&:focus": {
    outline: "none",
  },
  '&[data-orientation="vertical"]': {
    flexDirection: "column",
  },
});
export const SlimTabsTrigger = styled(TabsPrimitive.Trigger, {
  all: "unset",
  boxSizing: "border-box",
  userSelect: "none",
  borderBottom: "1px solid transparent",
  cursor: "pointer",
  "&::before": {
    boxSizing: "border-box",
  },
  "&::after": {
    boxSizing: "border-box",
  },
  height: "$6",
  pb: "$1",
  color: "$gray10",
  "@hover": {
    "&:hover": {
      color: "$hiContrast",
    },
  },

  '&[data-state="active"]': {
    background: "white",
    color: "$blue11",
    borderBottom: "2px solid $colors$blue11",
    fontWeight: "500",
  },
});
export const TabsTrigger = styled(TabsPrimitive.Trigger, {
  all: "unset",
  boxSizing: "border-box",
  userSelect: "none",
  "&::before": {
    boxSizing: "border-box",
  },
  "&::after": {
    boxSizing: "border-box",
  },
  height: "$6",
  display: "inline-flex",
  flexGrow: "1",
  flexShrink: "0",
  lineHeight: 1,
  fontSize: "$0",
  outline: "none",
  alignItems: "center",
  justifyContent: "center",
  color: "$slate11",
  borderRadius: "$2",
  zIndex: "10",
  textAlign: "center",
  cursor: "pointer",
  // background:'white',

  // boxShadow:shadowCreator('initial', '$colors$gray8', '$colors$gray6', '$colors$indigo9', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)'),
  "@hover": {
    "&:hover": {
      color: "$hiContrast",
      bc: "$gray2",
    },
  },

  '&[data-state="active"]': {
    background: "white",
    color: "black",
    boxShadow: shadowCreator(
      "focus",
      "$colors$blue6",
      "$colors$blue5",
      "$colors$cyan3",
      "rgba(9, 11, 20, 0.12)",
      "rgba(9, 11, 20, 0.18)"
    ),
  },

  '&[data-orientation="vertical"]': {
    justifyContent: "flex-start",
    borderTopRightRadius: 0,
    borderBottomLeftRadius: "$2",
    borderBottomColor: "transparent",

    '&[data-state="active"]': {
      borderRightColor: "transparent",
    },
  },
  variants: {
    variant: {
      verticalContent: {
        fd: "column",
        height: "auto",
        pb: "$2",
        "& span": {
          pt: "$3",
          pb: "$3",
          display: "flex",
          ai: "center",
          jc: "center",
        },
      },
    },
  },
});

type TabsListPrimitiveProps = React.ComponentProps<typeof TabsPrimitive.List>;
type TabsListProps = TabsListPrimitiveProps & { css?: CSS };

// eslint-disable-next-line react/display-name
export const TabsList = React.forwardRef<
  //@ts-ignore // TODO
  React.ElementRef<typeof StyledTabsList>,
  TabsListProps
>((props, forwardedRef) => <StyledTabsList {...props} ref={forwardedRef} />);

// eslint-disable-next-line react/display-name
export const SlimTabsList = React.forwardRef<
  //@ts-ignore // TODO
  React.ElementRef<typeof SlimStyledTabsList>,
  TabsListProps
>((props, forwardedRef) => (
  <SlimStyledTabsList {...props} ref={forwardedRef} />
));

export const TabsContent = styled(TabsPrimitive.Content, {
  flexGrow: 1,
  background: "none",
  "&:focus": {
    outline: "none",
  },
});
