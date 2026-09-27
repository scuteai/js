import type { Args, Decision, DecisionKind, Mode, Resource, ToolCall, ToolSpec, Verdict } from "./types";
import type { Run } from "./run";

const RANK: Record<DecisionKind, number> = {
  proceed: 0,
  transform: 1,
  approve: 2,
  // Verify before approve: an approver should see a request from a verified person.
  verify: 3,
  guide: 4,
  redirect: 5,
  deny: 6,
};

export const rank = (kind: DecisionKind) => RANK[kind];

export const stricter = (a: Decision, b: Decision) => (rank(b.kind) > rank(a.kind) ? b : a);

/** Did this verdict let the tool run? */
export const runs = (v: Pick<Verdict, "kind">) => v.kind === "proceed" || v.kind === "transform";

export class Call implements ToolCall {
  args: Args;
  /** The mode of the guard looking at the call right now. */
  mode: Mode = "enforce";

  constructor(
    readonly run: Run,
    readonly id: string,
    readonly tool: string,
    args: Args,
    readonly spec: ToolSpec,
    readonly messages: unknown[],
    readonly approvedByUser: boolean
  ) {
    this.args = { ...(args ?? {}) };
  }

  get permission() {
    return this.spec.permission;
  }

  get tier() {
    return this.spec.tier;
  }

  get resource(): Resource | undefined {
    return this.spec.resource(this.args);
  }

  proceed(): Decision {
    return { kind: "proceed" };
  }

  deny(message: string, reason = "denied"): Decision {
    return { kind: "deny", message, reason };
  }

  guide(message: string, reason = "guided"): Decision {
    return { kind: "guide", message, reason };
  }

  verify(message?: string, options: Decision["verify"] = {}): Decision {
    return { kind: "verify", reason: "verification_required", message, verify: { permission: this.permission ?? undefined, ...options } };
  }

  approve(message?: string): Decision {
    return { kind: "approve", reason: "confirmation_required", message, approve: { by: "user" } };
  }

  transform(args: Args, message?: string): Decision {
    return { kind: "transform", args, message };
  }

  redirect(to: string, message?: string): Decision {
    return { kind: "redirect", redirect: { to }, message };
  }
}

/** A short description of the call, for approvers and logs: "refund_invoice (invoice:42, amount 90)". */
export function describeCall(call: Pick<ToolCall, "tool" | "args">) {
  const parts = Object.entries(call.args ?? {})
    .filter(([, v]) => ["string", "number", "boolean"].includes(typeof v))
    .slice(0, 4)
    .map(([k, v]) => `${k} ${String(v).slice(0, 60)}`);
  return parts.length ? `${call.tool} (${parts.join(", ")})` : call.tool;
}

/**
 * What the model reads when a call doesn't run. Written so it knows what to
 * do next, not only that it failed.
 */
export function modelMessage(v: Pick<Verdict, "kind" | "decision">, options: { humanTools?: boolean } = {}): string {
  const d = v.decision;
  const said = (d.message ?? d.engine?.explanation ?? "").trim();
  switch (v.kind) {
    case "deny":
      return `Not allowed: ${said || "this action is blocked."} Don't retry it; tell the person.`;
    case "guide":
      return said || "Don't run this as it is.";
    case "redirect":
      return `Use ${d.redirect?.to ?? "another route"} instead.${said ? ` ${said}` : ""}`;
    case "verify":
      return options.humanTools
        ? `${said || "The person has to verify it's them first."} Verify them with scute_verify_person, then try again.`
        : `${said || "The person has to verify it's them first."} Tell them; try again once they have.`;
    case "approve":
      if (d.approve?.by !== "reviewer") return `${said || "The person has to confirm this first."} Ask them to confirm, then try again.`;
      return d.approve.requestId
        ? `${said || "A reviewer has to approve this."} The request is filed (id ${d.approve.requestId}); tell the person it's pending and try again once it's approved.`
        : `${said || "A reviewer has to approve this."} Tell the person it needs a reviewer's approval.`;
    default:
      return said;
  }
}
