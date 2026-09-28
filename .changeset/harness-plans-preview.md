---
"@scute/harness": minor
---

- `run.requestPlan(calls, reason)` files every call the agent means to make for one review. Once approved, each call that needed approval runs once with exactly those arguments, through `run.check`. `run.planStatus()` shows which steps ran.
- `run.preview(tool, args)` is a dry run: what Scute would answer now, without counting toward budgets or using up a verification or approval.
- The client gains `requestPlan` / `plan`, and `check` accepts `plan` and `dry_run`.
- `run.reportTools(definitions)` reports a hash of each tool definition, so Scute flags a tool that changes later (tool drift).
- `guards.decoy(tools)`: tools no legitimate task calls. A call is refused, reported, and Scute pauses the agent (the run closes).
