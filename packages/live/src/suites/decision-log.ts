// DX-08 item 10: the decision log has rows for the checks this run made
// (written by a background job, so this polls). No SDK method reads it:
// GET /v1/apps/:app_id/authz/decisions.

import { describe, expect, it } from "vitest";
import type { LiveContext } from "../lib/context";
import { eventually } from "../lib/check";

type Row = {
  id: string;
  user_id?: string;
  agent_id?: string;
  task_id?: string;
  permission?: string;
  resource?: string;
  decision: string;
  reason: string;
  details?: { via?: string; impersonated_by?: unknown };
};

export function decisionLogSuite(get: () => LiveContext) {
  describe("10. decision log", () => {
    it("reads back rows for the checks above: backend, client, agent, auth MCP, conversation, impersonated", async ({ skip }) => {
      const ctx = get();
      const main = ctx.state.main ?? skip("needs the email sign-in");
      if (!ctx.state.policyImported) skip("needs the imported policy");

      const wanted: Record<string, (r: Row) => boolean> = {
        "a backend deny (purge, no role grants it)": (r) => r.permission === ctx.perm("purge") && r.decision === "deny" && !r.agent_id,
        "a step-up answer (edit)": (r) => r.permission === ctx.perm("edit") && r.decision === "allow_with_step_up",
        "an allow through an approval (delete)": (r) => r.permission === ctx.perm("delete") && r.reason === "approved",
        "a check from the signed-in user (via client)": (r) => r.details?.via === "client",
        "an agent's check (via agent)": (r) => r.details?.via === "agent" && !!r.agent_id && !!r.task_id,
        "an auth MCP check (via auth_mcp)": (r) => r.details?.via === "auth_mcp",
        "a backend check for a conversation (via conversation)": (r) => r.details?.via === "conversation",
        "a check inside a session as the user (impersonated_by)": (r) => !!r.details?.impersonated_by,
      };

      let missing: string[] = Object.keys(wanted);
      await eventually(
        async () => {
          const rows: Row[] = [];
          let before: string | undefined;
          for (let page = 0; page < 5; page++) {
            const { data } = await ctx.api.get<{ decisions: Row[]; next?: string }>(`${ctx.api.appPath}/authz/decisions`, {
              query: { user_id: main.id, since: ctx.startedAt.toISOString(), limit: 200, before },
            });
            rows.push(...data.decisions);
            if (!data.next) break;
            before = data.next;
          }
          missing = Object.entries(wanted)
            .filter(([, match]) => !rows.some(match))
            .map(([name]) => name);
          return missing.length === 0;
        },
        { timeoutMs: 60_000, intervalMs: 3_000, what: "the decision log rows" }
      ).catch(() => undefined);

      expect(missing, `no row yet for: ${missing.join("; ")}`).toEqual([]);
    });
  });
}
