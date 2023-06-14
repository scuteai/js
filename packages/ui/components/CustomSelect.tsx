import * as Select from "@radix-ui/react-select";
import { styled, CSS } from "../stitches.config";
import React from "react";
import { CheckIcon, ChevronDownIcon } from "@radix-ui/react-icons";

export const CustomSelectTrigger = styled(Select.Trigger, {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid var(--colors-gray7)",
  borderRadius: "$3",
  jc: "space-between",
  lineHeight: 1,
  height: "$7",
  width: "100%",
  background: "white",
  px: "$3",
  fontWeight: "500",
  color: "$gray12",
  "&:hover": {
    background: "$gray2",
  },
  "&:focus": {},
  "&[data-placeholder]": {
    color: "$blue9",
  },
});

export const CustomSelectItemHolder = styled(Select.Item, {
  fontSize: "13px",
  lineHeight: 1,
  color: "$gray12",
  borderRadius: "3px",
  display: "flex",
  alignItems: "center",
  jc: "space-between",
  height: "28px",
  px: "$1",
  position: "relative",
  userSelect: "none",
  "&:hover": {
    backgroundColor: "$gray2",
  },
  ":disabled": {
    color: "var(--mauve8)",
    pointerEvents: "none",
  },
  '&[data-state="checked"]': {
    background: "$cyan5",
  },
  ":highlighted": {
    outline: "none",
    backgroundColor: "$activeComp",
    color: "$activeCompText",
  },
});

export const CustomSelectGroup = styled(Select.Group, {});

export const CustomSelectContent = styled(Select.Content, {
  overflow: "hidden",
  backgroundColor: "white",
  borderRadius: "6px",
  boxShadow:
    "0px 10px 38px -10px rgba(22, 23, 24, 0.35), 0px 10px 20px -15px rgba(22, 23, 24, 0.2)",
});

export const CustomSelectViewport = styled(Select.Viewport, {
  padding: "5px",
});
export const CustomSelectLabel = styled(Select.Label, {
  padding: "0 25px",
  fontSize: "12px",
  lineHeight: "25px",
  color: "var(--colors-mauve11)",
});
export const CustomSelectSeparator = styled(Select.Separator, {
  height: "1px",
  backgroundColor: "$gray3",
  margin: "5px",
});

const buttonCss = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "25px",
  backgroundColor: "white",
  color: "var(--colors-gray11)",
  cursor: "default",
};
export const CustomSelectScrollUpButton = styled(
  Select.ScrollUpButton,
  buttonCss
);
export const CustomSelectScrollDownButton = styled(
  Select.ScrollDownButton,
  buttonCss
);

export const CustomSelectValue = styled(Select.Value, {});
export const CustomSelectIcon = styled(Select.Icon, {});

interface CustomSelectItemProps {
  children: React.ReactNode;
  className?: string;
}

// type SelectItemPrimitiveProps = React.ComponentProps<typeof Select.SelectItemProps>;
// type TabsListProps = TabsListPrimitiveProps & { css?: CSS };

// export const TabsList = React.forwardRef<React.ElementRef<typeof StyledTabsList>, TabsListProps>(

// eslint-disable-next-line react/display-name
export const CustomSelectItem: React.ForwardRefExoticComponent<
  Select.SelectItemProps &
    CustomSelectItemProps &
    React.RefAttributes<HTMLDivElement>
> = React.forwardRef(({ children, className, ...props }, forwardedRef) => {
  return (
    <CustomSelectItemHolder className={className} {...props} ref={forwardedRef}>
      <Select.ItemText>{children}</Select.ItemText>
      <Select.ItemIndicator className="SelectItemIndicator">
        <CheckIcon />
      </Select.ItemIndicator>
    </CustomSelectItemHolder>
  );
});

const StyledCustomSelectRoot = styled(Select.Root, {});

type CustomSelectProps = React.ComponentProps<typeof StyledCustomSelectRoot> & {
  css?: CSS;
};

// eslint-disable-next-line react/display-name
export const CustomSelect = React.forwardRef<
  //@ts-ignore // TODO
  React.ElementRef<typeof StyledCustomSelectRoot>,
  CustomSelectProps
>(({ css, ...props }, forwardedRef) => (
  <StyledCustomSelectRoot css={css} {...props}>
    <CustomSelectTrigger aria-label="Food" ref={forwardedRef}>
      <Select.Value placeholder="Select a fruit…" />
      <Select.Icon className="SelectIcon">
        <ChevronDownIcon />
      </Select.Icon>
    </CustomSelectTrigger>
    <Select.Portal>
      <CustomSelectContent>
        <CustomSelectScrollUpButton className="SelectScrollButton">
          {/* <ChevronUpIcon /> */}
        </CustomSelectScrollUpButton>
        <CustomSelectViewport>{props.children}</CustomSelectViewport>
      </CustomSelectContent>
    </Select.Portal>
  </StyledCustomSelectRoot>
));
