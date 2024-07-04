import { styled, shadowCreator } from "../stitches.config";
import { Text } from "./Text";

export const Layout = styled("div", {
  maxWidth: "570px",
  width: "100%",
  fontWeight: "300",
  padding: "$4",
  background: "$surfaceBg",
  borderRadius: "$3",
});

export const ElementCard = styled("div", {
  background: "$cardBg",
  borderRadius: "$3",
});

export const ElementCardFooter = styled(Text, {
  pt: "$2 !important",
  color: "$cardFooterText !important",
  fontSize: "$2 !important",
  "& a": {
    color: "$cardFooterLink !important",
  },
});

export const Content = styled("div", {
  py: "$6",
});

export const FooterCredits = styled("div", {
  gap: "6px",
  display: "inline-flex",
  ai: "center",
  jc: "center",
  pt: "$3",
  fontSize: "$1",
  color: "$surfaceText",
  "& svg path": {
    fill: "$surfaceText",
  },
  "& span": {
    display: "flex",
    gap: "4px",
    ai: "center",
  },
});

export const FooterLinks = styled("div", {
  marginLeft: "auto",
  pt: "$3",
  fontSize: "$1",
  "& a": {
    color: "$surfaceLink",
    textDecoration: "none",
    ml: "$2",
  },
});

export const Header = styled("div", {
  display: "flex",
  mb: "$1",
});

export const Group = styled("div", {
  mb: "$4",
  mt: "$6",
});

export const Inner = styled("div", {
  px: "$6",
});

export const LogoContainer = styled("div", {
  background: "$surfaceLogoBg",
  padding: "$1",
  borderRadius: "$2",
  display: "flex",
  alignItems: "center",
  span: {
    ml: "$2",
    fontSize: "$3",
  },
});
