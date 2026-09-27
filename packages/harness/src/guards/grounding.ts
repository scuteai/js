import type { Guard, Mode, ToolCall } from "../types";
import { matches, type When } from "./when";

export type GroundingOptions = {
  /** Which arguments must be grounded, per tool. Default: ids, emails, phones, amounts, account numbers. */
  args?: Record<string, string[]>;
  /** Shorter values aren't checked. Default 3. */
  minLength?: number;
  when?: When;
  mode?: Mode;
};

const keyish = (k: string) =>
  k === "id" || /_id$/i.test(k) || /[a-z]Id$/.test(k) || /(email|phone|amount|account|number|iban)/i.test(k);

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "number" || typeof value === "boolean") out.push(String(value));
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach((v) => strings(v, out));
  return out;
}

/** Text the person wrote and tools returned: the only places a value may come from. */
function evidence(messages: unknown[]): string {
  const texts: string[] = [];
  for (const m of messages) {
    const role = (m as { role?: string })?.role;
    if (role !== "user" && role !== "tool") continue;
    strings((m as { content?: unknown }).content, texts);
  }
  return texts.join("\n").toLowerCase();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function seen(value: string | number, text: string, known: string[]): boolean {
  const s = String(value).toLowerCase();
  if (known.includes(s)) return true;
  if (typeof value === "number") {
    const forms = [String(value), value.toFixed(2), value.toLocaleString("en-US")];
    return forms.some((f) => new RegExp(`(^|[^0-9.])${escape(f)}([^0-9]|$)`).test(text));
  }
  return text.includes(s);
}

/**
 * Arguments have to come from the person, a tool result, or values you
 * grounded (run.ground()), not from the model's imagination. An invented
 * invoice id or email gets a "ask for it" instead of a call.
 */
export function grounding(options: GroundingOptions = {}): Guard {
  const minLength = options.minLength ?? 3;
  const argsFor = (call: ToolCall) =>
    options.args?.[call.tool] ?? Object.keys(call.args).filter(keyish);

  return {
    name: "grounding",
    mode: options.mode,
    before(call) {
      if (!matches(call, options.when)) return;
      const known = call.run.groundedValues();
      if (!call.messages.length && !known.length) return { kind: "proceed", reason: "no_transcript" };
      const text = evidence(call.messages);
      for (const name of argsFor(call)) {
        const v = call.args[name];
        if (typeof v !== "string" && typeof v !== "number") continue;
        if (String(v).length < minLength) continue;
        if (!seen(v, text, known)) {
          return call.guide(
            `Don't guess ${name}: "${String(v)}" isn't from the person or a tool result. Ask the person, or look it up with a tool.`,
            "ungrounded"
          );
        }
      }
    },
  };
}
