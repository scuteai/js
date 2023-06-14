import { styled } from "../stitches.config";

export const FieldSet = styled("section", {
  // Reset
  boxSizing: "border-box",
  flexShrink: 0,
  "&::before": {
    boxSizing: "border-box",
    content: '""',
  },
  "&::after": {
    boxSizing: "border-box",
    content: '""',
  },
  border: "1px solid $gray4",
  overflow: "hidden",
  borderRadius: "$3",
  display: "flex",
  fd: "column",
  pb: "$5",
  mb: "$5",
  bc: "white",
  variants: {
    variant: {
      withFooter: {
        pb: "0px !important",
      },
    },
  },
});

export const FieldSetHeader = styled("div", {
  px: "$4",
  mb: "$4",
  pt: "$2",
});
export const FieldSetFooter = styled("div", {
  px: "$4",
  pt: "$2",
  pb: "$2",
  mt: "$5",
  bc: "$gray2",
  display: "flex",
  jc: "space-between",
  ai: "center",
  color: "$gray10",
});
export const FieldSetTitle = styled("h1", {
  fontWeight: "500",
  color: "$gray12",
  fontSize: "$2",
  mb: "$2",
});
export const FieldSetSubtitle = styled("div", {
  fontWeight: "normal",
  color: "$gray9",
  lineHeight: "16px",
  fontSize: "$1",
});

export const FieldSetContent = styled("div", {
  px: "$4",
});
