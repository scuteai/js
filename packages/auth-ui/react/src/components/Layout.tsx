import { styled, shadowCreator } from "../stitches.config";

export const Layout = styled("div", {
  maxWidth: "400px",
  width: "100%",
  fontWeight: "300",
});

export const ElementCard = styled("div", {
  background: "$cardBg",
  borderRadius: "$2",
  boxShadow: "$colors$cardShadow",
  border: "$colors$cardBorder",
});

export const Content = styled("div", {
  py: "$6",
});

export const FooterCredits = styled("div", {
  gap: "6px",
  display: "inline-flex",
  ai: "center",
  jc: "center",
  p: "$2 $6",
  fontSize: "$1",
  "& span": {
    display: "flex",
    gap: "4px",
    ai: "center",
  },
});

export const Header = styled("div", {
  display: "flex",
  px: "$5",
  mb: "$5",
  jc: "center",
});

export const Group = styled("div", {
  mb: "$4",
  mt: "$6",
});

export const Inner = styled("div", {
  px: "$6",
});
