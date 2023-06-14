import { globalCss } from "./stitches.config";

export const globalStyles = globalCss({
  "*, *::before, *::after": {
    boxSizing: "border-box",
  },

  body: {
    margin: 0,
    color: "$hiContrast",
    backgroundColor: "$lowContrast",
    fontFamily: "$main",
    fontSize: "$3",
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
    WebkitTextSizeAdjust: "100%",

    ".dark-theme &": {
      backgroundColor: "$mauve1",
    },
  },

  svg: {
    display: "block",
    verticalAlign: "middle",
    overflow: "visible",
  },

  "pre, code": { margin: 0, fontFamily: "$mono" },

  "::selection": {
    backgroundColor: "$cyan5",
    color: "$violet8",
  },

  "#__next": {
    position: "relative",
    zIndex: 0,
    height: "100%",
  },

  "h1, h2, h3, h4, h5": { fontWeight: 500 },
});
