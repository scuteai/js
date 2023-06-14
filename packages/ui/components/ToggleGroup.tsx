import { styled, shadowCreator } from "../stitches.config";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";

export const ToggleGroup = styled(ToggleGroupPrimitive.Root, {
  // Reset
  alignItems: "center",
  appearance: "none",
  borderWidth: "0",
  boxSizing: "border-box",
  display: "inline-flex",
  background: "$gray1",
  borderRadius: "$3",
  px: "2px",
  height: "40px",
  ai: "center",
  jc: "center",
});

export const ToggleGroupItem = styled(ToggleGroupPrimitive.Item, {
  all: "unset",
  minWidth: "15px",
  display: "flex",
  fontSize: "$1",
  fontWeight: "500",
  gap: "$1",
  flexGrow: "1",
  ai: "center",
  jc: "center",
  px: "$2",
  ml: "1px",
  height: "90%",
  cursor: "pointer",
  "&:first-child": {
    borderTopLeftRadius: "$3",
    borderBottomLeftRadius: "$3",
  },
  "&:last-child": {
    borderTopRightRadius: "$3",
    borderBottomRightRadius: "$3",
  },
  boxShadow: shadowCreator(
    "initial",
    "$colors$gray6",
    "$colors$gray1",
    "$colors$indigo1",
    "rgba(9, 11, 20, 0)",
    "rgba(9, 11, 20, 0)"
  ),
  "&:hover": {
    background: "$compHighlight",
    color: "$hiContrast",
    boxShadow: shadowCreator(
      "initial",
      "$colors$gray8",
      "$colors$gray1",
      "$colors$indigo1",
      "rgba(9, 11, 20, 0)",
      "rgba(9, 11, 20, 0)"
    ),
  },
  '&[data-state="on"]': {
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
  "&[data-disabled]": {
    opacity: "20%",
  },
});
