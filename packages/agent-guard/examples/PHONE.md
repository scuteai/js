# Phone agents: Twilio / ElevenLabs / Vapi, guarded by Scute

Phone callers have no login, so they start **anonymous** and bind identity
mid-call via `verify_caller` (a Scute OTP/challenge). After that, every tool call
authorizes as them. `phone-agent.ts` is the wiring; the runnable proof is:

```bash
pnpm --filter @scute/agent-guard test phone-example
```

## The pattern (same for every provider)

1. Configure the provider's tool/function webhook to POST to **your** endpoint
   (never wire tools directly in the provider dashboard — that bypasses the gate).
2. In your handler: parse the body to a `ToolCall`, then `runPhoneTool(guard, call)`.
3. For `verify_caller`: run your Scute OTP/challenge; on success call
   `bindVerifiedCaller(guard, callId, identity)`.

```ts
// your webhook handler
app.post("/agent/tools", async (req, res) => {
  const call = parseElevenLabsWebhook(req.body); // or parseTwilioWebhook / parseVapiWebhook
  if (call?.toolName === "verify_caller") {
    const identity = await runScuteOtp(req.body);          // your Scute challenge
    if (identity) bindVerifiedCaller(guard, call.callId!, identity);
    return res.json({ result: identity ? "verified" : "code didn't match" });
  }
  const out = await runPhoneTool(guard, call!);
  res.json({ result: out.ok ? out.output : out.message }); // agent voices `message` on block
});
```

## Provider specifics

- **ElevenLabs** (Conversational AI): tool webhooks send `{ tool_name, parameters,
  conversation_id }`. `conversation_id` is the call/session id.
- **Twilio** (voice + an LLM, or Connect): post `{ tool/FunctionName, args, CallSid }`.
  `CallSid` is the call id. Onboard via Twilio Connect (api A06).
- **Vapi**: `{ message: { toolCalls: [{ id, function: { name, arguments } }] }, call: { id } }`.

The exact payloads vary by provider version — adjust the `parse*` helpers; the
gate (`runPhoneTool`) is unchanged.

## Demo

1. Call in, ask to do an account action → "I need to verify you first."
2. Complete the OTP → bound to your identity.
3. Ask again → allowed, scoped to you (you can't touch another caller's data).
4. Ask for something your role can't do → blocked.

Every decision lands in the agent's Activity in the dashboard.
