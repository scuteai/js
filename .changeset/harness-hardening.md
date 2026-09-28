---
"@scute/harness": minor
---

Hardening from a bug sweep:

- Reviewer approvals cover one exact call: the arguments go with the request, and only a check with the same arguments uses the approval. Approvals and verifications are spent only on a call no other guard stops (the permissions guard runs last).
- Tool arguments go to the engine as `context.args`; resource attributes come only from a tool's `attributes` mapping, and Scute's stored attributes win.
- `run.toolApproval` keeps each tool's own `needsApproval`.
- Run state is keyed by the person (and by token for token runs), so a reused id never carries one person's task or verification to another; a task revoked in Scute closes the run for good.
- Budgets are reserved when a call is allowed, and checks within a run go one at a time, so parallel tool calls can't overspend; hourly budgets on token runs are per person.
- Content guard: linear-time patterns, results scanned as the SDK serializes them (class instances too), redaction still applies when an injection is only flagged.
- Grounding matches whole tokens, walks nested arguments and recognizes emails and phone numbers by shape.
- A guard answering with an unknown decision counts as deny; a tool name with no letters is checked, not skipped.
