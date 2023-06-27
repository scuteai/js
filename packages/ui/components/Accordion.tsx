import React from "react";
import { styled, CSS, shadowCreator } from "../stitches.config";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@radix-ui/react-icons";

const StyledAccordion = styled(AccordionPrimitive.Root, {});

type AccordionPrimitiveProps = React.ComponentProps<
  typeof AccordionPrimitive.Root
>;
type AccordionProps = AccordionPrimitiveProps & { css?: CSS };

// eslint-disable-next-line react/display-name
export const Accordion = React.forwardRef<
  React.ElementRef<typeof StyledAccordion>,
  AccordionProps
>(({ children, ...props }, forwardedRef) => (
  <StyledAccordion
    ref={forwardedRef}
    {...props}
    {...(props.type === "single" ? { collapsible: true } : {})}
  >
    {children}
  </StyledAccordion>
));

const StyledItem = styled(AccordionPrimitive.Item, {
  // borderTop: '1px solid $colors$slate6',
  // borderBottom:'1px solid $gray4',

  "&:last-of-type": {
    // borderBottom: '1px solid $colors$slate6',
  },
});

const StyledHeader = styled("div", {});

const StyledIcon = styled("div", {
  transition: "transform .2s ease",
});

const StyledTrigger = styled(AccordionPrimitive.Trigger, {
  all: "unset",
  boxSizing: "border-box",
  userSelect: "none",
  transition: "transform .2s ease",
  "&::before": {
    boxSizing: "border-box",
  },
  "&::after": {
    boxSizing: "border-box",
  },

  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  cursor: "pointer",
  px: "$2",
  py: "$2",
  borderBottom: "1px solid $gray3",
  color: "$hiContrast",
  width: "100%",
  "@hover": {
    "&:hover": {
      backgroundColor: "$gray2",
    },
  },

  "&:focus": {
    outline: "none",
    // boxShadow: 'inset 0 0 0 1px $colors$slate8, 0 0 0 1px $colors$slate8',
  },

  '&[data-state="open"]': {
    // background:'$cyan4',
    [`& ${StyledIcon}`]: {
      transform: "rotate(-180deg)",
    },
  },
  variants: {
    variant: {
      minimal: {
        py: "$2",
        backgroundColor: "none!important",
        borderBottom: "none",
        "&:hover": {
          backgroundColor: "none",
        },
      },
    },
  },
});

type AccordionTriggerPrimitiveProps = React.ComponentProps<
  typeof AccordionPrimitive.Trigger
>;
type AccordionTriggerProps = AccordionTriggerPrimitiveProps & {
  css?: CSS;
  variant?: "minimal" | undefined;
};

// eslint-disable-next-line react/display-name
export const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof StyledTrigger>,
  AccordionTriggerProps
>(({ children, ...props }, forwardedRef) => (
  <StyledHeader>
    <StyledTrigger variant={props.variant} {...props} ref={forwardedRef}>
      {children}
      <StyledIcon>
        <ChevronDownIcon />
      </StyledIcon>
    </StyledTrigger>
  </StyledHeader>
));

const StyledContent = styled(AccordionPrimitive.Content, {
  px: "$1",
  py: "$2",
  transition: "transform .2s ease",
});

export const AccordionItem = StyledItem;
export const AccordionContent = StyledContent;
