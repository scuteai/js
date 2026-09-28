import type { Decision, Guard, Mode, ToolCall } from "../types";
import { content } from "./content";
import { decoy } from "./decoy";
import { grounding } from "./grounding";
import { args, budget } from "./limits";
import { approval, requesterOnly, verifyPerson } from "./people";
import { permissions } from "./permissions";

/**
 * Your own guard, as a plain function of the call. Answer with
 * call.proceed(), call.guide("..."), call.deny("..."), call.verify(),
 * call.approve(), call.transform(args) or call.redirect("tool").
 */
function define(
  name: string,
  before: (call: ToolCall) => Decision | void | Promise<Decision | void>,
  options: { mode?: Mode; after?: Guard["after"] } = {}
): Guard {
  return { name, mode: options.mode, before, after: options.after };
}

export const guards = { permissions, verifyPerson, approval, requesterOnly, grounding, args, budget, content, decoy, define };

export type { PermissionsOptions } from "./permissions";
export type { GroundingOptions } from "./grounding";
export type { ArgRule, BudgetOptions } from "./limits";
export type { ContentOptions, ContentProvider, Finding, PiiKind } from "./content";
export type { When } from "./when";
