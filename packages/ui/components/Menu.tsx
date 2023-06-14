import React from "react";
import * as MenuPrimitive from "@radix-ui/react-menu";
import { CheckIcon } from "@radix-ui/react-icons";
import { styled, css, CSS } from "../stitches.config";
import { Box } from "./Box";
import { Flex } from "./Flex";
import { panelStyles } from "./Panel";

export const baseItemCss = css({
  display: "flex",
  alignItems: "center",
  // justifyContent: 'space-between',
  gap: "$2",
  fontSize: "$2",
  fontVariantNumeric: "tabular-nums",
  lineHeight: "1",
  cursor: "default",
  fontWeight: "500",
  userSelect: "none",
  whiteSpace: "nowrap",
  borderRadius: "$2",
  height: "30px",
  px: "$2",
});

export const itemCss = css(baseItemCss, {
  position: "relative",
  color: "$hiContrast",
  cursor: "pointer",
  transition: "all .3s ease",
  "&[data-highlighted]": {
    outline: "none",
    backgroundColor: "$highlight",
  },

  "&[data-disabled]": {
    color: "$slate9",
  },
});

export const labelCss = css(baseItemCss, {
  color: "$slate11",
});

export const menuCss = css({
  boxSizing: "border-box",
  minWidth: 150,
  py: "$1",
  px: "$1",
  overflow: "hidden",
});

export const separatorCss = css({
  height: 1,
  my: "$1",
  backgroundColor: "$slate6",
});

export const Menu = styled(MenuPrimitive.Root, menuCss);
export const MenuContent = styled(MenuPrimitive.Content, panelStyles);

export const MenuSeparator = styled(MenuPrimitive.Separator, separatorCss);

export const MenuItem = styled(MenuPrimitive.Item, itemCss);

const StyledMenuRadioItem = styled(MenuPrimitive.RadioItem, itemCss);

type MenuRadioItemPrimitiveProps = React.ComponentProps<
  typeof MenuPrimitive.RadioItem
>;
type MenuRadioItemProps = MenuRadioItemPrimitiveProps & { css?: CSS };

// eslint-disable-next-line react/display-name
export const MenuRadioItem = React.forwardRef<
  //@ts-ignore // TODO
  React.ElementRef<typeof StyledMenuRadioItem>,
  MenuRadioItemProps
>(({ children, ...props }, forwardedRef) => (
  <StyledMenuRadioItem {...props} ref={forwardedRef}>
    <Box as="span" css={{ position: "absolute", left: "$1" }}>
      <MenuPrimitive.ItemIndicator>
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
          ></Box>
        </Flex>
      </MenuPrimitive.ItemIndicator>
    </Box>
    {children}
  </StyledMenuRadioItem>
));

const StyledMenuCheckboxItem = styled(MenuPrimitive.CheckboxItem, itemCss);

type MenuCheckboxItemPrimitiveProps = React.ComponentProps<
  typeof MenuPrimitive.CheckboxItem
>;
type MenuCheckboxItemProps = MenuCheckboxItemPrimitiveProps & { css?: CSS };

// eslint-disable-next-line react/display-name
export const MenuCheckboxItem = React.forwardRef<
  //@ts-ignore // TODO
  React.ElementRef<typeof StyledMenuCheckboxItem>,
  MenuCheckboxItemProps
>(({ children, ...props }, forwardedRef) => (
  <StyledMenuCheckboxItem {...props} ref={forwardedRef}>
    <Box as="span" css={{ position: "absolute", left: "$1" }}>
      <MenuPrimitive.ItemIndicator>
        <CheckIcon />
      </MenuPrimitive.ItemIndicator>
    </Box>
    {children}
  </StyledMenuCheckboxItem>
));

export const MenuLabel = styled(MenuPrimitive.Label, labelCss);
export const MenuRadioGroup = styled(MenuPrimitive.RadioGroup, {});
export const MenuGroup = styled(MenuPrimitive.Group, {});
