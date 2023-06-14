import { styled, css, keyframes } from "../stitches.config";

const bell = keyframes({
  "100": {
    "-webkit-transform": "rotate(0)",
    transform: "rotate(0)",
  },
  "0%": {
    "-webkit-transform": "rotate(0)",
    transform: "rotate(0)",
  },
  "1%": {
    "-webkit-transform": "rotate(28deg)",
    transform: "rotate(28deg)",
  },
  "3%": {
    "-webkit-transform": "rotate(-26deg)",
    transform: "rotate(-26deg)",
  },
  "5%": {
    "-webkit-transform": "rotate(32deg)",
    transform: "rotate(32deg)",
  },
  "7%": {
    "-webkit-transform": "rotate(-30deg)",
    transform: "rotate(-30deg)",
  },
  "9%": {
    "-webkit-transform": "rotate(28deg)",
    transform: "rotate(28deg)",
  },
  "11%": {
    "-webkit-transform": "rotate(-26deg)",
    transform: "rotate(-26deg)",
  },
  "13%": {
    "-webkit-transform": "rotate(24deg)",
    transform: "rotate(24deg)",
  },
  "15%": {
    "-webkit-transform": "rotate(-22deg)",
    transform: "rotate(-22deg)",
  },
  "17%": {
    "-webkit-transform": "rotate(20deg)",
    transform: "rotate(20deg)",
  },
  "19%": {
    "-webkit-transform": "rotate(-18deg)",
    transform: "rotate(-18deg)",
  },
  "21%": {
    "-webkit-transform": "rotate(16deg)",
    transform: "rotate(16deg)",
  },
  "23%": {
    "-webkit-transform": "rotate(-14deg)",
    transform: "rotate(-14deg)",
  },
  "25%": {
    "-webkit-transform": "rotate(12deg)",
    transform: "rotate(12deg)",
  },
  "27%": {
    "-webkit-transform": "rotate(-10deg)",
    transform: "rotate(-10deg)",
  },
  "29%": {
    "-webkit-transform": "rotate(8deg)",
    transform: "rotate(8deg)",
  },
  "31%": {
    "-webkit-transform": "rotate(-6deg)",
    transform: "rotate(-6deg)",
  },
  "33%": {
    "-webkit-transform": "rotate(4deg)",
    transform: "rotate(4deg)",
  },
  "35%": {
    "-webkit-transform": "rotate(-2deg)",
    transform: "rotate(-2deg)",
  },
  "37%": {
    "-webkit-transform": "rotate(1deg)",
    transform: "rotate(1deg)",
  },
  "39%": {
    "-webkit-transform": "rotate(-1deg)",
    transform: "rotate(-1deg)",
  },
  "41%": {
    "-webkit-transform": "rotate(0deg)",
    transform: "rotate(0deg)",
  },
  "43%": {
    "-webkit-transform": "rotate(0)",
    transform: "rotate(0)",
  },
});

export const IconHolder = styled("div", {
  "& svg": {
    animation: `${bell} 10s ease-in-out infinite`,
  },
});
export const panelStyles = css({
  backgroundColor: "$panel",
  borderRadius: "$3",
  boxShadow: "$colors$panelShadow",
  px: "$3",
  py: "$3",
  mb: "$4",
  variants: {
    variant: {
      solid: {
        boxShadow: "none",
      },
    },
  },
}) as any; // TODO;

export const Panel = styled("div", panelStyles);
