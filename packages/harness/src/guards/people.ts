import { describeCall } from "../decisions";
import type { Guard, Mode } from "../types";
import { matches, type When } from "./when";

/**
 * The person has to have verified in this run (recently) before these
 * calls. Start it with run.startVerification() and finish it with
 * run.completeVerification(); Scute checks the challenge is theirs.
 */
export function verifyPerson(
  options: { when?: When; methods?: string[]; maxAge?: number; message?: string; mode?: Mode } = {}
): Guard {
  const maxAgeMs = (options.maxAge ?? 900) * 1000;
  return {
    name: "verifyPerson",
    mode: options.mode,
    async before(call) {
      if (!matches(call, options.when)) return;
      const at = await call.run.verifiedAt();
      if (at && Date.now() - at < maxAgeMs) return;
      return call.verify(options.message ?? "The person has to verify it's them before this.", { methods: options.methods });
    },
  };
}

/**
 * The person the agent works for confirms these calls first (your chat
 * UI's approve button; AI SDK `toolApproval` shows it, or call
 * run.confirm(tool, args) from your UI). Default: high tier.
 * Approvals by someone else come from the policy (requires_approval).
 */
export function approval(options: { when?: When; message?: (text: string) => string; mode?: Mode } = {}): Guard {
  const when = options.when ?? { tier: "high" as const };
  return {
    name: "approval",
    mode: options.mode,
    async before(call) {
      if (!matches(call, when)) return;
      if (call.approvedByUser) return;
      if (call.mode === "enforce" && (await call.run.consumeConfirmation(call))) return;
      const text = `Confirm: ${describeCall(call)}`;
      return call.approve(options.message ? options.message(text) : text);
    },
  };
}

/**
 * Act only on the person who asked: the argument (an email, phone or user
 * id) must be the requester's, or one you added with run.identify().
 * Fails closed when the run doesn't know who asked.
 */
export function requesterOnly(options: { arg?: string | string[]; when?: When; mode?: Mode } = {}): Guard {
  const names = Array.isArray(options.arg) ? options.arg : [options.arg ?? "email"];
  return {
    name: "requesterOnly",
    mode: options.mode,
    before(call) {
      if (!matches(call, options.when)) return;
      const known = call.run.identities();
      for (const name of names) {
        const value = call.args[name];
        if (value === undefined || value === null || value === "") continue;
        if (!known.length) {
          return call.deny("I can't tell who is asking, so I can't act on a specific person yet.", "requester_unknown");
        }
        if (!known.includes(String(value).toLowerCase())) {
          return call.deny(`This can only be done for the person asking, not for ${String(value)}.`, "not_requester");
        }
      }
    },
  };
}
