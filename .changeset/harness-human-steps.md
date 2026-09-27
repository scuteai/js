---
"@scute/harness": minor
---

Human steps with the task token alone: `run.startVerification()`, `run.submitCode()`, `run.verificationStatus()` and reviewer approvals now go through the agent endpoints, so an agent without the secret key can verify its person and file approvals. `run.humanTools(jsonSchema)` gives the model `scute_verify_person`, `scute_submit_code`, `scute_check_verification`, `scute_approval_status` and `scute_whoami`, each answering with a `say` line; verdicts carry `say` too.
