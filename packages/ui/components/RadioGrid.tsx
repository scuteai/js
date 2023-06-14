import { styled, shadowCreator } from "../stitches.config";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

export const RadioGridGroup = styled(RadioGroupPrimitive.Root, {
  display: "grid",
  maxWidth: "100%",
  gap: "$2",
  gridTemplateColumns: "repeat(3, 1fr)",
});

export const RadioGrid = styled(RadioGroupPrimitive.Item, {
  all: "unset",
  boxSizing: "border-box",
  userSelect: "none",
  "&::before": {
    boxSizing: "border-box",
  },
  "&::after": {
    boxSizing: "border-box",
  },
  borderRadius: "$2",
  lineHeight: "$sizes$4",
  fontSize: "$1",
  cursor: "pointer",
  img: {
    width: "100%",
    height: "auto",
    borderRadius: "$3",
    boxShadow: shadowCreator(
      "focus",
      "$colors$gray7",
      "$colors$gray1",
      "$colors$indigo1",
      "rgba(9, 11, 20, 0.12)",
      "rgba(9, 11, 20, 0.18)"
    ),
  },
  "&:hover": {
    img: {
      boxShadow: shadowCreator(
        "focus",
        "$colors$gray6",
        "$colors$gray6",
        "$colors$indigo3",
        "rgba(9, 11, 20, 0.12)",
        "rgba(9, 11, 20, 0.18)"
      ),
    },
  },
  '&[data-state="checked"]': {
    fontWeight: "500",
    background: "$compActive",
    color: "$compActiveText",
    img: {
      boxShadow: shadowCreator(
        "focus",
        "$colors$blue11",
        "$colors$blue9",
        "$colors$blue9",
        "rgba(9, 11, 20, 0.12)",
        "rgba(9, 11, 20, 0.18)"
      ),
    },
    backgroundColor: "$white",
  },
});
