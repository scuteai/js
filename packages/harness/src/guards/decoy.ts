import type { Guard } from "../types";

/**
 * Decoy tools: tools no legitimate task calls (say `export_all_customers`).
 * Offer them to the model like any other tool and list them here. A call
 * means the agent was steered, usually by a prompt injection: it's refused,
 * and Scute pauses the agent and alerts your team (RB-45).
 */
export function decoy(tools: string[], options: { report?: boolean } = {}): Guard {
  const names = new Set(tools);
  return {
    name: "decoy",
    async before(call) {
      if (!names.has(call.tool)) return;
      if (options.report !== false) await call.run.reportDecoy(call.tool).catch(() => undefined);
      return call.deny("I can't continue with this. A person will follow up.", "decoy_called");
    },
  };
}
