import type { Guard, Mode, ToolCall } from "../types";
import { matches, type When } from "./when";

export type GroundingOptions = {
  /** Which arguments must be grounded, per tool (top-level names). Default: ids, emails, phones, amounts, account numbers, at any depth. */
  args?: Record<string, string[]>;
  /** Shorter values aren't checked. Default 3. */
  minLength?: number;
  when?: When;
  mode?: Mode;
};

const keyish = (k: string) =>
  k === "id" ||
  /_ids?$/i.test(k) ||
  /[a-z]Ids?$/.test(k) ||
  /(email|phone|amount|account|number|iban)/i.test(k);

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,63}$/;
const PHONE = /^\+?[\d\s().-]{7,20}$/;

/** Values an argument holds that need grounding: keyish names at any depth, and anything shaped like an email or phone. */
function candidates(value: unknown, key: string, forced: boolean, out: { name: string; value: string | number }[]) {
  if (typeof value === "string" || typeof value === "number") {
    const shaped = typeof value === "string" && (EMAIL.test(value) || (PHONE.test(value) && /\d{7,}/.test(value.replace(/\D/g, ""))));
    if (forced || keyish(key) || shaped) out.push({ name: key, value });
  } else if (Array.isArray(value)) {
    value.forEach((v) => candidates(v, key, forced, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) candidates(v, k, false, out);
  }
  return out;
}

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

/** As a whole token: "INV-100" isn't in "INV-1001", 100 isn't in "100.99". */
function seen(value: string | number, text: string, known: string[]): boolean {
  const s = String(value).toLowerCase();
  if (known.includes(s)) return true;
  if (typeof value === "number") {
    const forms = new Set([String(value), value.toFixed(2), value.toLocaleString("en-US")]);
    return [...forms].some((f) => new RegExp(`(^|[^0-9.])${escape(f)}(?![0-9]|\\.[0-9])`).test(text));
  }
  return new RegExp(`(^|[^a-z0-9_])${escape(s)}(?![a-z0-9_])`).test(text);
}

/**
 * Arguments have to come from the person, a tool result, or values you
 * grounded (run.ground()), not from the model's imagination. An invented
 * invoice id or email gets an "ask for it" instead of a call. Without a
 * transcript (messages) there is nothing to check against, so it passes;
 * adapters that have the conversation pass it along.
 */
export function grounding(options: GroundingOptions = {}): Guard {
  const minLength = options.minLength ?? 3;

  const valuesOf = (call: ToolCall) => {
    const listed = options.args?.[call.tool];
    const out: { name: string; value: string | number }[] = [];
    if (listed) listed.forEach((name) => candidates(call.args[name], name, true, out));
    else for (const [k, v] of Object.entries(call.args)) candidates(v, k, false, out);
    return out;
  };

  return {
    name: "grounding",
    mode: options.mode,
    before(call) {
      if (!matches(call, options.when)) return;
      const known = call.run.groundedValues();
      if (!call.messages.length && !known.length) return { kind: "proceed", reason: "no_transcript" };
      const text = evidence(call.messages);
      for (const { name, value } of valuesOf(call)) {
        if (String(value).length < minLength) continue;
        if (!seen(value, text, known)) {
          return call.guide(
            `Don't guess ${name}: "${String(value)}" isn't from the person or a tool result. Ask the person, or look it up with a tool.`,
            "ungrounded"
          );
        }
      }
    },
  };
}
