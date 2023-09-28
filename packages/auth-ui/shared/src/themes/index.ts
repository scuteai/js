export * from "./dark";
import type { createTheme } from "../stitches.config";
export type Theme = Parameters<typeof createTheme>[0];