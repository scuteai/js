import type { Tier, ToolCall } from "../types";

/** Which calls a guard applies to: tiers, tool names, or your own test. */
export type When = { tier?: Tier | Tier[]; tools?: string[] } | ((call: ToolCall) => boolean);

export function matches(call: ToolCall, when: When | undefined, fallback = true): boolean {
  if (!when) return fallback;
  if (typeof when === "function") return when(call);
  if (when.tools && !when.tools.includes(call.tool)) return false;
  if (when.tier) {
    const tiers = Array.isArray(when.tier) ? when.tier : [when.tier];
    if (!tiers.includes(call.tier)) return false;
  }
  return true;
}
