import React from "react";
import { styled, CSS } from "../stitches.config";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Box } from "./Box";
import { panelStyles } from "./Panel";
import { ScrollArea } from "./ScrollBar";
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

const StyledContent = styled(PopoverPrimitive.Content, panelStyles, {
  minWidth: 200,
  minHeight: "$6",
  maxWidth: "100%",
  "&:focus": {
    outline: "none",
  },
  [`& [data-scroll-content="true"]`]: {
    maxHeight: "560px", // TODO: Hack
  },
});

type PopoverContentPrimitiveProps = React.ComponentProps<
  typeof PopoverPrimitive.Content
>;
type PopoverContentProps = PopoverContentPrimitiveProps & {
  css?: CSS;
  hideArrow?: boolean;
};

// eslint-disable-next-line react/display-name
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof StyledContent>,
  PopoverContentProps
>(({ children, hideArrow, ...props }, fowardedRef) => (
  <PopoverPrimitive.Portal>
    <StyledContent sideOffset={0} {...props} ref={fowardedRef}>
      {children}
      {!hideArrow && (
        <Box css={{ color: "$panel" }}>
          <PopoverPrimitive.Arrow
            width={11}
            height={5}
            style={{ fill: "currentColor" }}
          />
        </Box>
      )}
    </StyledContent>
  </PopoverPrimitive.Portal>
));

const PopoverClose = PopoverPrimitive.Close;

export { Popover, PopoverTrigger, PopoverContent, PopoverClose };
