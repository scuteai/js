import type { CSSProperties } from "react";
import type { ScuteSignInAppearance } from "./types";

// [r, g, b] (0 to 255) from #rgb, #rrggbb, #rrggbbaa or rgb()/rgba(); null
// for anything else (a named color, var(), hsl()).
export function parseColor(color: string): [number, number, number] | null {
  const c = color.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(c);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((x) => x + x).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/i.exec(c);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

// WCAG relative luminance, 0 (black) to 1 (white).
function luminance([r, g, b]: [number, number, number]) {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Text color for a button filled with `accent`: whichever of near-black or white reads better. */
export function textOn(accent: string): string {
  const rgb = parseColor(accent);
  if (!rgb) return "#ffffff";
  const l = luminance(rgb);
  const dark = luminance([22, 22, 26]);
  return contrast(l, dark) >= contrast(l, 1) ? "#16161a" : "#ffffff";
}

/** The CSS variables `appearance` sets on the root. */
export function themeVars(appearance: ScuteSignInAppearance = {}): CSSProperties {
  const vars: Record<string, string> = {};
  const { accentColor, fontFamily } = appearance;
  if (accentColor) {
    vars["--scute-accent"] = accentColor;
    vars["--scute-accent-ink"] = textOn(accentColor);
    // The address chips take a tint of the accent instead of the default lime.
    vars["--scute-token-bg"] = `color-mix(in srgb, ${accentColor} 14%, transparent)`;
    vars["--scute-token-ink"] = "var(--scute-ink-strong)";
  }
  if (fontFamily) vars["--scute-font"] = fontFamily;
  return vars as CSSProperties;
}
