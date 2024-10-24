import { shadowCreator, styled } from "../stitches.config";

export const DropdownWrapper = styled("div", {
  position: "relative",
  fontWeight: "500",
  fontFamily: "$main",
  zIndex: 99999,
  boxSizing: "border-box",
});

export const DropdownButton = styled("button", {
  all: "unset",
  alignItems: "center",
  boxSizing: "border-box",
  userSelect: "none",
  "&::before": {
    boxSizing: "border-box",
  },
  "&::after": {
    boxSizing: "border-box",
  },
  transition: "all .2s ease-in-out",
  display: "inline-flex",
  gap: "$1",
  flexShrink: 0,
  justifyContent: "center",
  lineHeight: "1",
  WebkitTapHighlightColor: "rgba(0,0,0,0)",
  cursor: "pointer",
  px: "$2",
  fontFamily: "$main",
  fontSize: "$3",
  fontWeight: "500",
  fontVariantNumeric: "tabular-nums",
  borderRadius: "$round",
  position: "relative",
  "&:active": {
    transform: "scale(0.96)",
  },
  textTransform: "uppercase",
  color: "$userAvatarText",
  backgroundColor: "$userAvatarBg",
  width: "$7",
  height: "$7",
  overflow: "hidden",
  backgroundSize: "cover",
  backgroundPosition: "center",
  border: `1px solid $userAvatarBorder`,
});

export const DropdownMenu = styled("div", {
  position: "absolute",
  top: "calc(100% + 4px)",
  right: 0,
  boxSizing: "border-box",
  borderRadius: "$1",
  overflow: "hidden",
  background: "$userMenuBg",
  color: "$userMenuText",
  boxShadow: shadowCreator(
    "initial",
    "transparent",
    "$colors$userMenuShadow",
    "$colors$userMenuShadow",
    "$colors$userMenuShadow",
    "$colors$userMenuShadow"
  ),
});

export const DropdownUserInfo = styled("div", {
  display: "flex",
  alignItems: "center",
  padding: "$2",
  gap: "$1",
  borderBottom: `1px solid $userMenuSeparator`,
});

export const DropdownAvatar = styled("div", {
  width: "$6",
  height: "$6",
  borderRadius: "$round",
  display: "inline-flex",
  gap: "$1",
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "center",
  lineHeight: "1",
  cursor: "pointer",
  px: "$2",
  fontFamily: "$main",
  fontSize: "$3",
  fontWeight: "500",
  fontVariantNumeric: "tabular-nums",
  position: "relative",
  textTransform: "uppercase",
  backgroundColor: "$userAvatarBg",
  color: "$userAvatarText",
  overflow: "hidden",
  backgroundSize: "cover",
  backgroundPosition: "center",
  border: `1px solid $userAvatarBorder`,
});

export const DropdownName = styled("div", {
  fontSize: "$1",
  fontWeight: "500",
  cursor: "default",
});

export const DropdownEmail = styled("div", {
  fontSize: "$0",
  fontWeight: "400",
  cursor: "default",
});

export const DropdownItem = styled("button", {
  all: "unset",
  transition: "all .2s ease-in-out",
  boxSizing: "border-box",
  padding: "$2",
  cursor: "pointer",
  fontSize: "$1",
  fontWeight: "500",
  display: "block",
  width: "100%",
  "&:hover": {
    background: "$userMenuHoverBg",
    color: "$userMenuHoverText",
  },
  "&:active": {
    background: "$userMenuHoverBg",
    color: "$userMenuHoverText",
  },
});
