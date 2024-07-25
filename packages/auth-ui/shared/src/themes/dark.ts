import type { Theme } from ".";

export const darkTheme: Theme = {
  colors: {
    errorColor: "#fe4f0d",
    svgIconColor: "#121212",
    // Loading indicator
    loadingSpinnerColor: "#cccccc",
    // Surface
    surfaceBg: "#f7f7f7",
    surfaceLink: "#666666",
    surfaceText: "#666666",
    surfaceTextBg: "#ffffff",
    // Card
    cardBg: "#ffffff",
    cardHeadingText: "#121212",
    cardBodyText: "#121212",
    cardFooterText: "#b0b0b0",
    cardFooterLink: "#b0b0b0",
    // Panel
    panelBg: "#f7f7f7",
    panelText: "#121212",
    // Input
    inputBg: "#ffffff",
    inputText: "#121212",
    inputPlaceholder: "#333333",
    inputBorder: "#333333",
    inputFocusGlow: "rgba(46, 234, 175, 0.3)",

    inputDisabledBg: "#DEDEDE",
    inputDisabledText: "#333333",

    // Buttons
    // Default variant
    buttonIconColor: "#ffffff",

    buttonIdleText: "white",
    buttonIdleBg: "#212121",
    buttonIdleBorder: "transparent",
    buttonIdleShadow: "transparent",

    buttonPassiveBg: "#f7f7f7",
    buttonPassiveText: "#bababa",

    buttonHoverBg: "#121212",
    buttonHoverText: "white",
    buttonHoverBorder: "black",
    buttonHoverShadow: "transparent",

    buttonFocusBorder: "rgba(46, 234, 175, 0.3)",
    buttonFocusShadow: "rgba(46, 234, 175, 0.3)",

    // Alt variant
    buttonAltIconColor: "#ffffff", //

    buttonAltIdleText: "#333333",
    buttonAltIdleBg: "white",
    buttonAltIdleBorder: "rgba(0,0,0,0.2)",
    buttonAltIdleShadow: "rgba(0,0,0,0.05)",

    buttonAltPassiveBg: "#757575", //

    buttonAltHoverBg: "#121212",
    buttonAltHoverText: "white",
    buttonAltHoverBorder: "rgba(0,0,0,0.05)",
    buttonAltHoverShadow: "rgba(0,0,0,0.05)",

    buttonAltFocusBorder: "rgba(46, 234, 175, 0.3)",
    buttonAltFocusShadow: "rgba(46, 234, 175, 0.3)",

    // Social variant
    buttonSocialIconColor: "#ffffff", //

    buttonSocialIdleText: "#222222",
    buttonSocialIdleBg: "#f7f7f7",
    buttonSocialIdleBorder: "transparent",
    buttonSocialIdleShadow: "transparent",

    buttonSocialPassiveBg: "#757575", //

    buttonSocialHoverBg: "#f7f7f7",
    buttonSocialHoverText: "#222222",
    buttonSocialHoverBorder: "transparent",
    buttonSocialHoverShadow: "transparent",

    buttonSocialFocusBorder: "rgba(46, 234, 175, 0.3)",
    buttonSocialFocusShadow: "rgba(46, 234, 175, 0.3)",
  },
  fonts: {
    main: '"Inter", -apple-system, system-ui, sans-serif',
    mono: "monospace",
  },
};
