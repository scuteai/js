# Turnkey LiveKit voice agent, guarded by Scute

A real `@livekit/agents` voice worker where every tool call is gated by Scute
RBAC. You run this (it needs your LiveKit project + an LLM); I can't drive audio
or your LiveKit project from here, so this is a copy-paste-runnable scaffold, not
something verified in CI.

## What's correct vs what to check

- **Correct (Scute):** the token mint stamping `scute_*` attributes, and the
  guard wiring (`ScuteVerifier` + `guardedLiveKitTool` + the `maxAmount` rung).
- **Check against your version:** the `@livekit/agents` voice-pipeline
  boilerplate (`AgentSession`, `Agent`, `llm.tool`, `WorkerOptions`,
  `waitForParticipant`). It's written to the v0.x Node API; newer versions may
  rename a few things. The Scute parts don't change.

## Prereqs

1. A LiveKit project (LiveKit Cloud free tier is fine) → `LIVEKIT_URL`, key, secret.
2. Your Scute API running + migrated (`cd api && rails db:migrate`).
3. A Scute app with RBAC set up (see Seed below).
4. `cp .env.example .env` and fill it in.

## Seed Scute (one time)

Create the permissions + role and assign it, so the demo has something to gate.
Easiest via `rails console` in `api/` (replace the app):

```ruby
app = App.find_by(public_id: "app_xxxx")
read   = app.permissions.create!(slug: "orders:read",   name: "Read Orders",   category: "custom")
refund = app.permissions.create!(slug: "orders:refund", name: "Refund Orders", category: "custom")
support = app.roles.create!(slug: "support", name: "Support", category: "custom")
support.permissions << read   # NOTE: start WITHOUT refund, to demo granting it live
user = app.create_app_user_with_email("caller@test.com")
sess = user.create_test_session          # the access token
sess_obj = user.token_sessions.order(:created_at).last
sess_obj.token_session_roles.create!(role: support)
puts sess[:access]                        # -> use as scuteToken below
```

## Run it

```bash
pnpm install
pnpm token-server     # terminal 1  (mints join tokens on :3100)
pnpm agent            # terminal 2  (the LiveKit agent worker)
```

Get a join token for your caller (paste the access token from the seed step):

```bash
curl -s localhost:3100/token -H 'content-type: application/json' \
  -d '{"userId":"caller","roles":["support"],"scuteToken":"<ACCESS_TOKEN>"}'
```

Join the room with that token using LiveKit's **Agents Playground**
(https://agents-playground.livekit.io) or your own frontend, and talk to the agent.

## The demo to try (over voice)

1. "Look up order 4471" → it works (`orders:read`).
2. "Refund order 4471" → "you're not permitted" (role lacks `orders:refund`).
3. In `rails console`: `support.permissions << refund` → ask again → it refunds
   (live — no rejoin needed).
4. Ask to refund a huge amount → blocked by the `maxAmount(500)` policy rung.
5. Mark refund as gated (`refund.update!(requires_verification: true,
   verification_method: "totp")`) → the agent says it needs to verify you first.

Every decision shows up in the dashboard Activity for the agent.
