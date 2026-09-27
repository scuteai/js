import type { Args, Guard, Mode, Tier } from "../types";
import type { Run } from "../run";

export type ArgRule = { min?: number; max?: number; maxLength?: number; pattern?: RegExp; oneOf?: unknown[] };

/**
 * Limits on arguments, per tool and field; the model is told what to fix.
 * A function gets the arguments and returns a message when they're wrong.
 */
export function args(
  rules: Record<string, Record<string, ArgRule> | ((args: Args) => string | void)>,
  options: { mode?: Mode } = {}
): Guard {
  return {
    name: "args",
    mode: options.mode,
    before(call) {
      const rule = rules[call.tool];
      if (!rule) return;
      if (typeof rule === "function") {
        const problem = rule(call.args);
        return problem ? call.guide(problem, "invalid_args") : undefined;
      }
      for (const [field, r] of Object.entries(rule)) {
        const v = call.args[field];
        if (v === undefined || v === null) continue;
        if (typeof v === "number") {
          if (r.max !== undefined && v > r.max) return call.guide(`${field} can be at most ${r.max}.`, "invalid_args");
          if (r.min !== undefined && v < r.min) return call.guide(`${field} has to be at least ${r.min}.`, "invalid_args");
        }
        if (typeof v === "string") {
          if (r.maxLength !== undefined && v.length > r.maxLength) {
            return call.guide(`${field} can be at most ${r.maxLength} characters.`, "invalid_args");
          }
          if (r.pattern && !r.pattern.test(v)) return call.guide(`${field} isn't in the expected format.`, "invalid_args");
        }
        if (r.oneOf && !r.oneOf.includes(v)) {
          return call.guide(`${field} has to be one of: ${r.oneOf.map(String).join(", ")}.`, "invalid_args");
        }
      }
    },
  };
}

export type BudgetOptions = {
  /** Tool calls per run. */
  calls?: number;
  /** Executions per hour for this agent and person, across runs: a number, or per tier. */
  perHour?: number | Partial<Record<Tier, number>>;
  /** Model spend per run, from run.recordUsage(). */
  usdPerRun?: number;
  mode?: Mode;
};

/**
 * Budgets: calls per run, executions per hour (per tier) and spend. A
 * spent budget denies; pair it with `stopWhen: run.budgetExceeded`.
 */
export function budget(options: BudgetOptions): Guard & { exhausted(run: Run): Promise<boolean> } {
  const overRun = async (run: Run) => {
    const s = await run.snapshot();
    if (options.calls !== undefined && s.calls >= options.calls) return `This run has used its ${options.calls} tool calls.`;
    if (options.usdPerRun !== undefined && s.usd >= options.usdPerRun) return `This run has spent its $${options.usdPerRun} budget.`;
    return undefined;
  };

  return {
    name: "budget",
    mode: options.mode,
    async exhausted(run) {
      return !!(await overRun(run));
    },
    async before(call) {
      const spent = await overRun(call.run);
      if (spent) return call.deny(`${spent} Stop here and tell the person what's left.`, "budget_exhausted");
      if (options.perHour === undefined) return;
      const recent = await call.run.recentExecutions();
      const limit = typeof options.perHour === "number" ? options.perHour : options.perHour[call.tier];
      if (limit === undefined) return;
      const used = typeof options.perHour === "number" ? recent.length : recent.filter((e) => e.tier === call.tier).length;
      if (used >= limit) {
        const what = typeof options.perHour === "number" ? "actions" : `${call.tier}-risk actions`;
        return call.deny(`The hourly limit of ${limit} ${what} is reached. Tell the person to try again later.`, "budget_exhausted");
      }
    },
  };
}
