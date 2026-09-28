# Voice helpdesk with ElevenLabs + Scute

A phone helpdesk agent that unlocks accounts, resets passwords and opens
tickets, and only ever does it for the person Scute verified in that call.

```
caller ── ElevenLabs agent ──┬── Scute auth MCP   (who is this? send/check codes, may I?)
                             └── this backend     (unlock / reset / ticket)
                                      └── asks Scute: who got verified in
                                          this conversation, and may I?
```

- The agent talks to the **Scute auth MCP** to verify the caller with a
  one-time code. It passes ElevenLabs' `{{system__conversation_id}}`, so the
  conversation is linked to the person Scute verified.
- The **backend tools** get the same conversation id, ask Scute who got
  verified in it and whether the agent may do this for them, and act on
  that person. The model never picks who to act on.
- A password reset needs a fresh verification (`requires_verification` in
  `policy.json`). Scute answers `allow_with_step_up`, the agent verifies the
  caller again, and that one verification covers that one action.

## Run it

```bash
cp env.example .env     # your app id + secret, a TOOL_SECRET
pnpm install
pnpm setup              # imports policy.json, registers the agent, makes its key
pnpm start              # the tools backend on :8787
```

`pnpm setup` prints the MCP URL and the agent key (shown once). Then in
ElevenLabs:

1. **Tools > MCP server**: the URL from setup, header
   `Authorization: Bearer scak_...`.
2. **Tools > Webhook**: add the three tools from `elevenlabs/tools.json`
   with your backend's https URL. Store `TOOL_SECRET` as the workspace
   secret `tool_secret`.
3. **System prompt**: paste `elevenlabs/prompt.md`.

## Try it

1. "Hi, I'm locked out." The agent asks for your work email and sends a code.
2. Read the code out. You're verified; the agent unlocks your account.
3. "Can you reset my password too?" The agent says it needs to check it's
   you again, sends a new code, then resets it.
4. "Now reset my boss's password." The tools only act on you, so it can't.

Everything the agent did shows up on the agent's conversation in the Scute
dashboard (Agents > helpdesk-voice > Conversations), with each decision.

## Swap in your directory

`src/server.ts` has a stand-in `directory` that just logs. Replace it with
calls to Entra, Okta or your own user store.

## Notes

- The agent key is a secret: keep it in ElevenLabs' MCP settings only.
- The tools backend checks `X-Tool-Secret` on every call.
- Suspending the agent in Scute stops every open conversation at once.
