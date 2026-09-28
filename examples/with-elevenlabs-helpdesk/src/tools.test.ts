import { describe, expect, it, vi } from "vitest";
import { runTool, type Directory, type ToolDeps } from "./tools";

const jane = { app_user_id: "u1", email: "jane@client.test", name: "Jane Doe" };

function deps(opts: { verified?: boolean; decision?: string; say?: string } = {}) {
  const directory: Directory = {
    unlock: vi.fn(async () => {}),
    resetPassword: vi.fn(async () => ({ temporaryPassword: "x" })),
    createTicket: vi.fn(async () => ({ id: "HD-1234" })),
  };
  const scute = {
    agentConversation: vi.fn(async () => ({
      data: { conversation_id: "conv_1", verified: opts.verified ?? true, person: opts.verified === false ? undefined : jane, ended: false,
              task: { id: "t1", status: "open" } },
      error: null,
    })),
    agentConversationCheck: vi.fn(async () => ({
      data: { decision: opts.decision ?? "allow", allowed: (opts.decision ?? "allow") === "allow", reason: "role_grant", say: opts.say },
      error: null,
    })),
  } as unknown as ToolDeps["scute"];
  return { scute, directory, agent: "helpdesk-voice" };
}

describe("helpdesk tools", () => {
  it("acts on the person Scute verified, not on what the model passes", async () => {
    const d = deps();
    const result = await runTool("unlock_account", { conversation_id: "conv_1", email: "ceo@client.test" }, d);

    expect(result).toMatchObject({ ok: true, say: expect.stringContaining("unlocked") });
    expect(d.directory.unlock).toHaveBeenCalledWith("jane@client.test");
    expect(d.scute.agentConversationCheck).toHaveBeenCalledWith("helpdesk-voice", "conv_1", { action: "unlock", resource: "account" });
  });

  it("asks who they are when nobody is verified yet", async () => {
    const d = deps({ verified: false });
    const result = await runTool("reset_password", { conversation_id: "conv_1" }, d);

    expect(result).toMatchObject({ ok: false, say: expect.stringContaining("who you are") });
    expect(d.directory.resetPassword).not.toHaveBeenCalled();
  });

  it("passes on Scute's line when the answer isn't a plain yes (verify again first)", async () => {
    const d = deps({ decision: "allow_with_step_up", say: "Before I do that, I need to verify it's you." });
    const result = await runTool("reset_password", { conversation_id: "conv_1" }, d);

    expect(result).toMatchObject({ ok: false, say: "Before I do that, I need to verify it's you.", data: { decision: "allow_with_step_up" } });
    expect(d.directory.resetPassword).not.toHaveBeenCalled();
  });

  it("refuses an unknown tool or a missing conversation id", async () => {
    expect((await runTool("wipe_everything", { conversation_id: "conv_1" }, deps())).ok).toBe(false);
    expect((await runTool("unlock_account", {}, deps())).ok).toBe(false);
  });
});
