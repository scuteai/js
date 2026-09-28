// The helpdesk tools ElevenLabs calls (server tools). Before acting, each
// one asks Scute two things about the conversation:
//   1. who got verified in it (the auth MCP did that with a code), and
//   2. may the agent do this for them right now (roles, conditions, step-up).
// It then acts on the person Scute verified: never on a name or email the
// model passes in.
import type { AgentConversation, ScuteAdminApi } from "@scute/js-core";

export type Directory = {
  unlock(email: string): Promise<void>;
  resetPassword(email: string): Promise<{ temporaryPassword: string }>;
  createTicket(email: string, summary: string): Promise<{ id: string }>;
};

export type ToolDeps = {
  scute: Pick<ScuteAdminApi, "agentConversation" | "agentConversationCheck">;
  agent: string;
  directory: Directory;
};

export type ToolResult = { ok: boolean; say: string; data?: Record<string, unknown> };

type Tool = {
  action: string;
  resource: string;
  run: (person: NonNullable<AgentConversation["person"]>, args: Record<string, unknown>, directory: Directory) => Promise<ToolResult>;
};

export const TOOLS: Record<string, Tool> = {
  unlock_account: {
    action: "unlock",
    resource: "account",
    run: async (person, _args, directory) => {
      await directory.unlock(person.email!);
      return { ok: true, say: "Your account is unlocked. You can sign in again now." };
    },
  },
  reset_password: {
    action: "reset_password",
    resource: "account",
    run: async (person, _args, directory) => {
      await directory.resetPassword(person.email!);
      // The temporary password goes to their email, never through the call.
      return { ok: true, say: "Done. I've emailed you a temporary password; you'll pick a new one when you sign in." };
    },
  },
  create_ticket: {
    action: "create",
    resource: "ticket",
    run: async (person, args, directory) => {
      const ticket = await directory.createTicket(person.email!, String(args.summary ?? "Help needed"));
      return { ok: true, say: `I've opened ticket ${ticket.id}. The team will follow up by email.`, data: { ticket: ticket.id } };
    },
  },
};

export async function runTool(name: string, args: Record<string, unknown>, deps: ToolDeps): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) return { ok: false, say: "I can't do that one." };

  const conversationId = typeof args.conversation_id === "string" ? args.conversation_id : "";
  if (!conversationId) return { ok: false, say: "Something's off on my side. Let me try that again." };

  const { data: conversation } = await deps.scute.agentConversation(deps.agent, conversationId);
  if (!conversation?.verified || !conversation.person?.email) {
    return { ok: false, say: "First I need to know who you are. What's your work email?" };
  }

  const { data: decision, error } = await deps.scute.agentConversationCheck(deps.agent, conversationId, {
    action: tool.action,
    resource: tool.resource,
  });
  if (error || !decision) return { ok: false, say: "I couldn't check that just now. Can we try again in a moment?" };
  if (decision.decision !== "allow") {
    // allow_with_step_up: the agent verifies them again (scute_verify_again), then calls the tool again.
    return { ok: false, say: decision.say ?? "I'm not able to do that.", data: { decision: decision.decision } };
  }

  return tool.run(conversation.person, args, deps.directory);
}
