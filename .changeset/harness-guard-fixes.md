---
"@scute/harness": patch
---

Streaming AI SDK tools (async generator `execute`) now run every part through the after-guards; an iterable returned behind a Promise is guarded and its last part returned. `guards.args` `min`/`max` hold for numeric strings (`{ amount: "900" }`) and refuse non-numeric values in a bounded field. `run.revoke()`/`run.complete()` on a run with a backend task token look up and close the task when SCUTE_SECRET is set, and throw `no_credentials` without it (the run still stops locally; a closed run's `token()` now throws `task_closed`). Tools with `needsApproval` are charged to budgets once, when they execute. `guards.grounding` gains an opt-in `requireTranscript` (fail closed when no conversation is passed; the default still passes). The content guard also scans object keys and ignores invisible characters when looking for injected instructions.
