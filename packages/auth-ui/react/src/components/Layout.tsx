import { styled, shadowCreator } from "../stitches.config";

export const Header = styled("div", {
  display: "flex",
  mb: "$3",
});

export const Layout = styled("div", {
  width: "100%",
  maxWidth: "1200px",
  fontWeight: "500",
  fontFamily: "$main",
  padding: "$4",
  background: "$surfaceBg",
  borderRadius: "$3",
  backgroundSize: "cover",
  containerType: "inline-size",
  containerName: "queryContainer",
  "@media screen and (max-width: 600px)": {
    padding: "$3",
    [`& > ${Header}`]: {
      mb: "$2",
    },
  },
});

export const ElementCard = styled("div", {
  position: "relative",
  overflow: "hidden",
  background: "$cardBg",
  borderRadius: "$3",
});

export const ElementCardFooter = styled("div", {
  pt: "$4",
  color: "$cardFooterText",
  fontSize: "$1",
  lineHeight: "$sizes$4",
  pl: "$6",
  pr: "$6",
  "@container queryContainer (max-width: 600px)": {
    pl: "$3",
    pr: "$3",
  },
  "& a": {
    color: "$cardFooterLink !important",
    textDecoration: "underline !important",
    transition: "color 0.2s ease-in-out",
    "&:hover": {
      color: "$buttonIdleBg !important",
    },
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
  display: "flex",
  alignItems: "center",
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

export const Group = styled("div", {
  mb: "$4",
  mt: "$6",
  "@container queryContainer (max-width: 470px)": {
    mb: "$2",
    mt: "$4",
  },
});

export const Inner = styled("div", {
  px: "$6",
  "@container queryContainer (max-width: 600px)": {
    px: "$3 !important",
  },
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

export const QueryContainer = styled("div", {});

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

export const ProfileWrapper = styled("div", {
  maxWidth: "640px",
  margin: "0 auto",
  fontWeight: "500",
  fontFamily: "$main",
  padding: "1px $4 $4 $4",
  background: "$surfaceBg",
  borderRadius: "$3",
  backgroundSize: "cover",
  containerType: "inline-size",
  containerName: "queryContainer",
  "@media screen and (max-width: 520px)": {
    padding: "1px $2 $2 $2",
  },
});

export const ProfileHeader = styled("div", {
  color: "$surfaceText",
  fontWeight: "700",
  fontSize: "$7",
  my: "$4",
});

export const ProfileSubHeader = styled("div", {
  color: "$cardBodyText",
  fontWeight: "500",
  fontSize: "$5",
  my: "0px",
  py: "0px",
});
