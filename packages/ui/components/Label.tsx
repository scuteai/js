import { styled } from "../stitches.config";
import * as LabelPrimitive from "@radix-ui/react-label";
import { Text } from "./Text";

export const Label = styled(LabelPrimitive.Root, Text, {
  display: "inline-flex",
  verticalAlign: "middle",
  cursor: "default",
  gap: "$1",
  ai: "center",
});
