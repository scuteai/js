# @scute/harness

## 0.2.0-next.0

### Minor Changes

- c44094d: New package: `@scute/harness`, guardrails for the agents you build.

  - `createHarness({ agent, guards, tools })` and `harness.run({ actsFor, task })`: each run is a short-lived Scute task (the token never reaches the model) that guards check tool calls against.
  - Guards answer proceed, transform, approve, verify, guide, redirect or deny; the strictest enforced answer wins, errors fail closed, and each guard runs in `enforce`, `monitor` or `observe` mode.
  - Built in: `permissions` (the agent's roles, the person it works for and the task), `verifyPerson`, `approval`, `requesterOnly`, `grounding`, `args`, `budget`, `content` (credentials, PII redaction, instructions hidden in tool results), and `define` for your own.
  - Tool names map to permissions (`refund_invoice` -> `invoice:refund`), with per-tool overrides.
  - Vercel AI SDK v7: `run.tools()`, `run.toolApproval`, `run.prepareStep` and `run.budgetExceeded`. Any other loop: `run.wrap()` or `run.check()`.
  - Verification, confirmations and reviewer approvals carry over between requests through a pluggable store.

- b5d7457: Hardening from a bug sweep:

  - Reviewer approvals cover one exact call: the arguments go with the request, and only a check with the same arguments uses the approval. Approvals and verifications are spent only on a call no other guard stops (the permissions guard runs last).
  - Tool arguments go to the engine as `context.args`; resource attributes come only from a tool's `attributes` mapping, and Scute's stored attributes win.
  - `run.toolApproval` keeps each tool's own `needsApproval`.
  - Run state is keyed by the person (and by token for token runs), so a reused id never carries one person's task or verification to another; a task revoked in Scute closes the run for good.
  - Budgets are reserved when a call is allowed, and checks within a run go one at a time, so parallel tool calls can't overspend; hourly budgets on token runs are per person.
  - Content guard: linear-time patterns, results scanned as the SDK serializes them (class instances too), redaction still applies when an injection is only flagged.
  - Grounding matches whole tokens, walks nested arguments and recognizes emails and phone numbers by shape.
  - A guard answering with an unknown decision counts as deny; a tool name with no letters is checked, not skipped.

- a92953c: Human steps with the task token alone: `run.startVerification()`, `run.submitCode()`, `run.verificationStatus()` and reviewer approvals now go through the agent endpoints, so an agent without the secret key can verify its person and file approvals. `run.humanTools(jsonSchema)` gives the model `scute_verify_person`, `scute_submit_code`, `scute_check_verification`, `scute_approval_status` and `scute_whoami`, each answering with a `say` line; verdicts carry `say` too.
- 48ac34d: Properties (RB-42): `run.property(name)` reads one of the app's secrets inside a tool, at call time, with the task token. `run.sign(name, { claims } | { data })` signs with one of the app's key pairs; the private key never leaves Scute. Only the property's listed agents can use it, and only while the task is live (and allowed the property's permission, when it names one). Use the value, don't return it: it should never reach the model.
