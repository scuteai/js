---
"@scute/harness": minor
---

New package: `@scute/harness`, guardrails for the agents you build.

- `createHarness({ agent, guards, tools })` and `harness.run({ actsFor, task })`: each run is a short-lived Scute task (the token never reaches the model) that guards check tool calls against.
- Guards answer proceed, transform, approve, verify, guide, redirect or deny; the strictest enforced answer wins, errors fail closed, and each guard runs in `enforce`, `monitor` or `observe` mode.
- Built in: `permissions` (the agent's roles, the person it works for and the task), `verifyPerson`, `approval`, `requesterOnly`, `grounding`, `args`, `budget`, `content` (credentials, PII redaction, instructions hidden in tool results), and `define` for your own.
- Tool names map to permissions (`refund_invoice` -> `invoice:refund`), with per-tool overrides.
- Vercel AI SDK v7: `run.tools()`, `run.toolApproval`, `run.prepareStep` and `run.budgetExceeded`. Any other loop: `run.wrap()` or `run.check()`.
- Verification, confirmations and reviewer approvals carry over between requests through a pluggable store.
