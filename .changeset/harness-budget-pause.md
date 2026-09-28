---
"@scute/harness": patch
---

A run closes for good when Scute pauses the agent for going over its budget (`budget_exceeded`), the same as when its task is revoked. It no longer mints a fresh task for a paused agent.
