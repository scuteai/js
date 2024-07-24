import { styled, shadowCreator } from "../stitches.config";
import { Text } from "./Text";

export const Layout = styled("div", {
  width: "100%",
  maxWidth: "1100px",
  fontWeight: "300",
  fontFamily: "$main",
  padding: "$4",
  background: "$surfaceBg",
  borderRadius: "$3",
});

export const ElementCard = styled("div", {
  position: "relative",
  overflow: "hidden",
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
  mt: "$3",
  fontSize: "$1",
  color: "$surfaceText",
  padding: "$1",
  background: "$surfaceTextBg",
  borderRadius: "$2",
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
  mt: "$3",
  fontSize: "$1",
  py: "$1",
  px: "$2",
  background: "$surfaceTextBg",
  borderRadius: "$2",
  "& a": {
    color: "$surfaceLink",
    textDecoration: "none",
    ml: "$2",
  },
  "& a:first-child": {
    color: "$surfaceLink",
    textDecoration: "none",
    ml: 0,
  },
});

export const Header = styled("div", {
  display: "flex",
  mb: "$3",
});

export const Group = styled("div", {
  mb: "$4",
  mt: "$6",
});

export const Inner = styled("div", {
  px: "$6",
});

export const LogoContainer = styled("div", {
  background: "$surfaceTextBg",
  py: "$1",
  px: "$2",
  borderRadius: "$2",
  display: "flex",
  alignItems: "center",
  span: {
    ml: "$2",
    fontSize: "$3",
  },
});

export const LogoPlaceholder = styled("div", {
  width: "$6",
  height: "$6",
  borderRadius: "$1",
  background: "$surfaceBg",
});

export const AppNamePlaceholder = styled("div", {
  width: "$10",
  height: "$2",
  borderRadius: "$1",
  background: "$surfaceBg",
});

export const QueryContainer = styled("div", {
  containerType: "inline-size",
  containerName: "queryContainer",
  py: "$8",
});
export const ResponsiveContainer = styled("div", {
  display: "flex",
  flexDirection: "column",
  "@container queryContainer (min-width: 950px)": {
    flexDirection: "row",
  },
});
export const ResponsiveLeft = styled("div", {
  flex: 1,
});
export const ResponsiveRight = styled("div", {
  flex: 1,
});
