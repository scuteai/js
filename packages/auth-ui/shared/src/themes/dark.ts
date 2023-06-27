import type { Theme } from ".";

export const darkTheme: Theme = {
  colors: {
    contrast10: "#ffffff",
    contrast9: "#EDEDED",
    contrast8: "#DEDEDE",
    contrast7: "#BABABA",
    contrast6: "#999999",
    contrast5: "#757575",
    contrast4: "#545454",
    contrast3: "#424242",
    contrast2: "#333333",
    contrast1: "#212121",
    contrast0: "#1f2023",
    // Semantic colors
    hiContrast: "$contrast10",
    loContrast: "$contrast0",
    headingColor: "$contrast10",
    textColor: "$contrast9",
    errorColor: "#e34647",
    focusColor: "rgba(46, 234, 175, 0.3)",
    focusColorLight: "rgba(46, 234, 175, 0.2)",
    //
    cardBg: "$contrast0",
    cardShadow:
      "rgba(0, 0, 0, 0.05) 0px 6px 24px 0px, rgba(0, 0, 0, 0.08) 0px 0px 0px 1px",
    cardBorder: "none",
    // panel

    panel: "black",
    panelShadow:
      "rgba(0, 0, 0, 0.05) 0px 6px 24px 0px, rgba(0, 0, 0, 0.08) 0px 0px 0px 1px",

    buttonIconColor: "#444444",

    buttonIdleText: "$contrast1",
    buttonIdleBg: "$contrast9",
    buttonPassiveBg: "$contrast5",
    buttonHoverBg: "$contrast10",
    buttonHoverText: "black",

    buttonIdleBorder: "rgba(0,0,0,1)",
    buttonIdleShadow1: "rgba(0,0,0,1)",
    buttonIdleShadow2: "rgba(0,0,0,1)",

    buttonHoverBorder: "black",
    buttonHoverShadow1: "rgba(0,0,0,1)",
    buttonHoverShadow2: "rgba(0,0,0,1)",

    buttonFocusBorder: "$focusColor",
    buttonFocusRing1: "$focusColor",
    buttonFocusRing2: "$focusColor",
    buttonFocusShadow1: "$focusColor",
    buttonFocusShadow2: "$focusColor",

    buttonAltIdleText: "$contrast9",
    buttonAltIdleBg: "transparent",
    buttonAltPassiveBg: "$contrast5",
    buttonAltHoverBg: "$contrast10",
    buttonAltHoverText: "black",

    buttonAltIdleBorder: "rgba(0,0,0,0.2)",
    buttonAltIdleShadow1: "rgba(0,0,0,0.05)",
    buttonAltIdleShadow2: "rgba(0,0,0,0.05)",

    buttonAltHoverBorder: "rgba(0,0,0,0.05)",
    buttonAltHoverRing1: "rgba(0,0,0,0.05)",
    buttonAltHoverRing2: "rgba(0,0,0,0.05)",
    buttonAltHoverShadow1: "rgba(0,0,0,0.05)",
    buttonAltHoverShadow2: "rgba(0,0,0,0.05)",

    buttonAltFocusBorder: "$focusColor",
    buttonAltFocusRing1: "$focusColor",
    buttonAltFocusRing2: "$focusColor",
    buttonAltFocusShadow1: "$focusColor",
    buttonAltFocusShadow2: "$focusColor",
  },
  fonts: {
    main: '"Inter", -apple-system, system-ui, sans-serif',
    mono: "monospace",
  },
};
