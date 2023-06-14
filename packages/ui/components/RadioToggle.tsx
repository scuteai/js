import React from "react";
import { styled, CSS, shadowCreator } from "../stitches.config";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

const StyledRadio = styled(RadioGroupPrimitive.Item, {
  all: "unset",
  boxSizing: "border-box",
  userSelect: "none",
  flexShrink: "0",
  flexGrow: "1",
  "&::before": {
    boxSizing: "border-box",
  },
  "&::after": {
    boxSizing: "border-box",
  },
  display: "flex",
  alignItems: "center",
  jc: "center",
  borderRadius: "$2",
  gap: "$2",
  fontSize: "$1",
  fontWeight: "500",
  height: "$7",
  px: "$3",
  bc: "$gray3",
  cursor: "pointer",
  boxShadow: shadowCreator(
    "initial",
    "$colors$gray2",
    "$colors$gray1",
    "$colors$indigo1",
    "rgba(9, 11, 20, 0)",
    "rgba(9, 11, 20, 0)"
  ),
  "@hover": {
    "&:hover": {
      boxShadow: shadowCreator(
        "initial",
        "$colors$gray7",
        "$colors$gray1",
        "$colors$indigo1",
        "rgba(9, 11, 20, 0)",
        "rgba(9, 11, 20, 0)"
      ),
    },
  },
  '&[data-state="checked"]': {
    background: "$compActive",
    color: "$compActiveText",
    boxShadow: shadowCreator(
      "focus",
      "$colors$blue9",
      "$colors$blue8",
      "$colors$indigo9",
      "rgba(9, 11, 20, 0.12)",
      "rgba(9, 11, 20, 0.18)"
    ),
  },

  variants: {
    size: {
      "1": {
        height: "$6",
      },
      "2": {
        height: "$7",
      },
    },
  },
  defaultVariants: {
    size: "2",
  },
});

export const RadioToggleGroup = styled(RadioGroupPrimitive.Root, {
  display: "flex",
  gap: "$2",
  flexWrap: "wrap",
  width: "100%",
  variants: {
    variant: {
      vertical: {
        fd: "column",
      },
      grid: {
        fd: "row",
        ai: "center",
        jc: "center",
        textAlign: "center",
        [`& ${StyledRadio}`]: {
          width: "45%",
        },
      },
    },
  },
});

type RadioGroupItemPrimitiveProps = React.ComponentProps<
  typeof RadioGroupPrimitive.Item
>;
type RadioToggleProps = RadioGroupItemPrimitiveProps & {
  css?: CSS;
  size?: number | "1" | "2";
};

// eslint-disable-next-line react/display-name
export const RadioToggle = React.forwardRef<
  //@ts-ignore // TODO
  React.ElementRef<typeof StyledRadio>,
  RadioToggleProps
>((props, forwardedRef) => (
  <StyledRadio size={props.size} {...props} ref={forwardedRef}>
    {props.children}
  </StyledRadio>
));
