export * from "./dark";
export * from "./custom";
export * from "./minimal";
import type { createTheme } from "../stitches.config";
export type Theme = Parameters<typeof createTheme>[0];

// TODO: Think more about how to reset our components as to not be affected by external stylings
// TODO: Merge theme objects instead of overriding
// export default const themes = {
//   dark: dark
// }
