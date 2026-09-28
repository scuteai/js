---
"@scute/js-core": minor
---

Server side, for voice and chat agents that verify people through the Scute auth MCP:

- `admin.createAgentKey(agentSlug, name?)` makes an agent key (`scak_...`) to connect a platform like ElevenLabs to the auth MCP. The key is in the answer once.
- `admin.agentConversation(agentSlug, conversationId)` says who got verified in a conversation, by the platform's own conversation id.
- `admin.agentConversationCheck(agentSlug, conversationId, { action, resource })` asks whether the agent may do something for that person. The answer has a `say` line for the agent.
