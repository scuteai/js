import { css, styled } from "../stitches.config";

export const panelStyles = css({
  backgroundColor: "$panel",
  borderRadius: "$3",
  boxShadow: "0px 6px 20px rgba(0,0,0,0.2)",
  variants: {
    variant: {
      solid: {
        boxShadow: "none",
      },
    },
  },
});

export const Panel = styled("div", panelStyles);

export const PanelGroup = styled("section", {
  display: "flex",
  fd: "column",
  p: "$3",
  mb: "$4",
});
export const PanelGroupHeader = styled("div", {
  display: "flex",
  jc: "space-between",
  ai: "center",
  fontSize: "$1",
  fontWeight: "500",
  color: "$gray10",
});
export const PanelGroupContent = styled("div", {
  mt: "$3",
  display: "flex",
  fd: "column",
});

export const PanelTitle = styled("h2", {
  px: "$3",
  fontSize: "$2",
  pt: "$1",
  color: "black",
});
export const PanelNote = styled("div", {
  fontSize: "$2",
  color: "$gray7",
});
