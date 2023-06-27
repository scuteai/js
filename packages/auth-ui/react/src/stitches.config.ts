import { __stitchesConfig, shadowCreator } from "@scute/ui-shared";
import {
  createStitches,
  type CSS as BaseCSS,
  type VariantProps,
} from "@stitches/react";

export const {
  styled,
  css,
  theme,
  createTheme,
  getCssText,
  globalCss,
  keyframes,
  config,
  reset,
  // get from shared ui config
} = createStitches(__stitchesConfig);

export type CSS = BaseCSS<typeof config>;
export type { VariantProps };
export { shadowCreator };
