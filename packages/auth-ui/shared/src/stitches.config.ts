import { createStitches } from "@stitches/core";
import type { CSS as BaseCSS, CSSProperties } from "@stitches/core";

export const {
  css,
  theme,
  createTheme,
  getCssText,
  globalCss,
  keyframes,
  config,
  reset,
} = createStitches({
  prefix: "scute",
  theme: {
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
    space: {
      1: "5px",
      2: "10px",
      3: "15px",
      4: "20px",
      5: "25px",
      6: "35px",
      7: "45px",
      8: "65px",
      9: "80px",
    },
    sizes: {
      1: "5px",
      2: "10px",
      3: "15px",
      4: "20px",
      5: "25px",
      6: "30px",
      7: "40px",
      8: "46px",
      9: "50px",
      10: "65px",
    },
    fontSizes: {
      0: "0.75rem",
      1: "0.8125rem",
      2: "0.875rem",
      3: "1rem",
      4: "1.125rem",
      5: "1.25rem",
      6: "1.5rem",
      7: "1.875rem",
      8: "2.25rem",
    },
    radii: {
      1: "5px",
      2: "10px",
      3: "15px",
      4: "20px",
      round: "50%",
      pill: "9999px",
    },
  },
  media: {
    bp1: "(min-width: 520px)",
    bp2: "(min-width: 900px)",
    bp3: "(min-width: 1200px)",
    bp4: "(min-width: 1800px)",
    motion: "(prefers-reduced-motion)",
    hover: "(any-hover: hover)",
    dark: "(prefers-color-scheme: dark)",
    light: "(prefers-color-scheme: light)",
  },
  utils: {
    p: (value: PropertyValue<"padding">) => ({
      padding: value,
    }),
    pt: (value: PropertyValue<"paddingTop">) => ({
      paddingTop: value,
    }),
    pr: (value: PropertyValue<"paddingRight">) => ({
      paddingRight: value,
    }),
    pb: (value: PropertyValue<"paddingBottom">) => ({
      paddingBottom: value,
    }),
    pl: (value: PropertyValue<"paddingLeft">) => ({
      paddingLeft: value,
    }),
    px: (value: PropertyValue<"paddingLeft">) => ({
      paddingLeft: value,
      paddingRight: value,
    }),
    py: (value: PropertyValue<"paddingTop">) => ({
      paddingTop: value,
      paddingBottom: value,
    }),

    m: (value: PropertyValue<"margin">) => ({
      margin: value,
    }),
    mt: (value: PropertyValue<"marginTop">) => ({
      marginTop: value,
    }),
    mr: (value: PropertyValue<"marginRight">) => ({
      marginRight: value,
    }),
    mb: (value: PropertyValue<"marginBottom">) => ({
      marginBottom: value,
    }),
    ml: (value: PropertyValue<"marginLeft">) => ({
      marginLeft: value,
    }),
    mx: (value: PropertyValue<"marginLeft">) => ({
      marginLeft: value,
      marginRight: value,
    }),
    my: (value: PropertyValue<"marginTop">) => ({
      marginTop: value,
      marginBottom: value,
    }),

    ta: (value: PropertyValue<"textAlign">) => ({ textAlign: value }),

    fd: (value: PropertyValue<"flexDirection">) => ({
      flexDirection: value,
    }),
    fw: (value: PropertyValue<"flexWrap">) => ({ flexWrap: value }),

    ai: (value: PropertyValue<"alignItems">) => ({
      alignItems: value,
    }),
    ac: (value: PropertyValue<"alignContent">) => ({
      alignContent: value,
    }),
    jc: (value: PropertyValue<"justifyContent">) => ({
      justifyContent: value,
    }),
    as: (value: PropertyValue<"alignSelf">) => ({ alignSelf: value }),
    fg: (value: PropertyValue<"flexGrow">) => ({ flexGrow: value }),
    fs: (value: PropertyValue<"flexShrink">) => ({
      flexShrink: value,
    }),
    fb: (value: PropertyValue<"flexBasis">) => ({ flexBasis: value }),

    bc: (value: PropertyValue<"backgroundColor">) => ({
      backgroundColor: value,
    }),

    br: (value: PropertyValue<"borderRadius">) => ({
      borderRadius: value,
    }),
    btrr: (value: PropertyValue<"borderTopRightRadius">) => ({
      borderTopRightRadius: value,
    }),
    bbrr: (value: PropertyValue<"borderBottomRightRadius">) => ({
      borderBottomRightRadius: value,
    }),
    bblr: (value: PropertyValue<"borderBottomLeftRadius">) => ({
      borderBottomLeftRadius: value,
    }),
    btlr: (value: PropertyValue<"borderTopLeftRadius">) => ({
      borderTopLeftRadius: value,
    }),

    bs: (value: PropertyValue<"boxShadow">) => ({ boxShadow: value }),

    pe: (value: PropertyValue<"pointerEvents">) => ({
      pointerEvents: value,
    }),
    userSelect: (value: PropertyValue<"userSelect">) => ({
      WebkitUserSelect: value,
      userSelect: value,
    }),

    size: (value: PropertyValue<"width">) => ({
      width: value,
      height: value,
    }),
    appearance: (value: PropertyValue<"appearance">) => ({
      WebkitAppearance: value,
      appearance: value,
    }),
    backgroundClip: (value: PropertyValue<"backgroundClip">) => ({
      WebkitBackgroundClip: value,
      backgroundClip: value,
    }),
  },
});

type PropertyValue<Property extends keyof CSSProperties> = {
  // https://github.com/stitchesjs/stitches/issues/1078
  // NOTE: fixes the serialization error, investigate affects
  // readonly [K in $$PropertyValue]: Property
  readonly [K in any]: Property;
};

export type CSS = BaseCSS<typeof config>;

export const shadowCreator = (
  state: string,
  border: string,
  ring1: string,
  ring2: string,
  bottom1: string,
  bottom2: string
) => {
  if (state === "focus") {
    return `
      inset 0 1px 0 0 rgba(255, 255, 255, 0.1), 
      inset 0 0 0 0 rgba(0,0,0,0), 
      inset 0 0 0 0 rgba(0,0,0,0), 
      0 0 0 1px ${border}, 
      0 0 0 1px ${ring1}, 
      0 0 0 3px ${ring2}, 
      0 2px 1px 0 ${bottom1}, 
      0 2px 3px 0 ${bottom2}
    `;
  } else if (state === "disabled") {
    return `
      inset 0 0 0 0 rgba(0,0,0,0), 
      inset 0 0 0 0 rgba(0,0,0,0), 
      inset 0 0 0 0 rgba(0,0,0,0), 
      0 0 0 1px ${border}, 
      0 2px 1px 0 ${bottom1}, 
      0 2px 3px 0 ${bottom2}, 
      0 0 0 0 rgba(0,0,0,0), 
      0 0 0 0 rgba(0,0,0,0);
    `;
  } else {
    return `
    inset 0 1px 0 0 rgba(255, 255, 255, 0.1), 
    inset 0 0 0 0 rgba(0,0,0,0), 
    inset 0 0 0 0 rgba(0,0,0,0), 
    0 0 0 1px ${border}, 
    0 2px 1px 0 ${bottom1}, 
    0 2px 3px 0 ${bottom2}, 
    0 0 0 0 rgba(0,0,0,0),
    0 0 0 0 rgba(0,0,0,0)
 `;
  }
};
