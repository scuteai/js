# Example: LiveKit support agent guarded by Scute

A voice/chat support agent where every tool call is gated by Scute RBAC, with
identity flowing in from the LiveKit participant's access-token attributes.

`livekit-support-agent.ts` is the copy-pasteable wiring; the runnable proof is
the e2e test, which drives the full demo against a mock Scute (no LiveKit or
running Scute needed):

```bash
pnpm --filter @scute/agent-guard test livekit-example
```

## The demo it proves (7 steps)

1. `lookup_order` → **allowed** (role has `orders:read`)
2. `refund_order` → **blocked** (role lacks `orders:refund`)
3. dashboard grants `orders:refund` → retry → **allowed** (live, no token refresh)
4. `refund_order` with `amount: 5000` → **blocked by policy** (the `maxAmount(500)` rung)
5. dashboard marks `orders:refund` as requiring verification → **needs challenge**
6. caller completes the challenge → **allowed**

Every decision (including the blocks) is recorded as a span.

## Wiring real LiveKit

**Server (mint the join token):** stamp the signed-in user's Scute identity +
token into the participant attributes.

```ts
new AccessToken(KEY, SECRET, { identity: user.id })
  .withAttributes({
    scute_user_id: user.id,
    scute_roles: roles.join(","),
    scute_kind: "user",
    scute_token: userScuteAccessToken, // enables LIVE permission resolution
  })
  .withGrants({ roomJoin: true, room });
```

**Agent worker (livekit-agents):** read `ctx.participant.attributes`, build the
guarded tools, and register the returned functions as `@function_tool` handlers.

```ts
const guard = buildGuard({ scuteBaseUrl, appId });
const { lookupOrder, refundOrder } = buildGuardedTools(guard, ctx.participant.attributes, db);
// register lookupOrder / refundOrder as the agent's function tools
```

A blocked / challenged call returns a `ToolResponse` whose `message` the agent
speaks back to the caller ("I need to verify you first…").

## Phone / SIP callers

No join token, so they start anonymous and bind identity mid-call via a
`verify_caller` tool (Scute OTP) before account actions unlock — see the Twilio
example (A11) for that pattern.

## Not covered here

The actual LiveKit runtime (audio, the worker process) needs a LiveKit project
to run; this example covers the guard wiring + the full decision flow.
