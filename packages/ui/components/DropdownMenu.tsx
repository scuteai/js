import React from "react";
import { CheckIcon } from "@radix-ui/react-icons";
import { styled, CSS } from "../stitches.config";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { menuCss, separatorCss, itemCss, labelCss } from "./Menu";
import { Box } from "./Box";
import { Flex } from "./Flex";
import { panelStyles } from "./Panel";

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const StyledContent = styled(
  DropdownMenuPrimitive.Content,
  menuCss,
  panelStyles
);

type DropdownMenuContentPrimitiveProps = React.ComponentProps<
  typeof DropdownMenuPrimitive.Content
>;
type DropdownMenuContentProps = DropdownMenuContentPrimitiveProps & {
  css?: CSS;
};

// eslint-disable-next-line react/display-name
const DropdownMenuContent = React.forwardRef<
  //@ts-ignore // TODO
  React.ElementRef<typeof StyledContent>,
  DropdownMenuContentProps
>((props, forwardedRef) => (
  <DropdownMenuPrimitive.Portal>
    <StyledContent {...props} ref={forwardedRef} />
  </DropdownMenuPrimitive.Portal>
));

const DropdownMenuItem = styled(DropdownMenuPrimitive.Item, itemCss);
const DropdownMenuGroup = styled(DropdownMenuPrimitive.Group, {});
const DropdownMenuLabel = styled(DropdownMenuPrimitive.Label, labelCss);
const DropdownMenuSeparator = styled(
  DropdownMenuPrimitive.Separator,
  separatorCss
);

const StyledDropdownMenuCheckboxItem = styled(
  DropdownMenuPrimitive.CheckboxItem,
  itemCss
);

type DialogMenuCheckboxItemPrimitiveProps = React.ComponentProps<
  typeof DropdownMenuPrimitive.CheckboxItem
>;
type DialogMenuCheckboxItemProps = DialogMenuCheckboxItemPrimitiveProps & {
  css?: CSS;
};

// eslint-disable-next-line react/display-name
const DropdownMenuCheckboxItem = React.forwardRef<
  //@ts-ignore // TODO
  React.ElementRef<typeof StyledDropdownMenuCheckboxItem>,
  DialogMenuCheckboxItemProps
>(({ children, ...props }, forwardedRef) => (
  <StyledDropdownMenuCheckboxItem {...props} ref={forwardedRef}>
    <Box as="span" css={{ position: "absolute", left: "$1" }}>
      <DropdownMenuPrimitive.ItemIndicator>
        <CheckIcon />
      </DropdownMenuPrimitive.ItemIndicator>
    </Box>
    {children}
  </StyledDropdownMenuCheckboxItem>
));

const DropdownMenuRadioGroup = styled(DropdownMenuPrimitive.RadioGroup, {});
const StyledDropdownMenuRadioItem = styled(
  DropdownMenuPrimitive.RadioItem,
  itemCss
);

type DialogMenuRadioItemPrimitiveProps = React.ComponentProps<
  typeof DropdownMenuPrimitive.RadioItem
>;
type DialogMenuRadioItemProps = DialogMenuRadioItemPrimitiveProps & {
  css?: CSS;
};

// eslint-disable-next-line react/display-name
const DropdownMenuRadioItem = React.forwardRef<
  //@ts-ignore // TODO
  React.ElementRef<typeof StyledDropdownMenuRadioItem>,
  DialogMenuRadioItemProps
>(({ children, ...props }, forwardedRef) => (
  <StyledDropdownMenuRadioItem {...props} ref={forwardedRef}>
    <Box as="span" css={{ position: "absolute", left: "$1" }}>
      <DropdownMenuPrimitive.ItemIndicator>
        <Flex
          css={{
            width: "$3",
            height: "$3",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Box
            css={{
              width: "$1",
              height: "$1",
              backgroundColor: "currentColor",
              borderRadius: "$round",
            }}
          />
        </Flex>
      </DropdownMenuPrimitive.ItemIndicator>
    </Box>
    {children}
  </StyledDropdownMenuRadioItem>
));

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
};
