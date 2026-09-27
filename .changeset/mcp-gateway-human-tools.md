---
"@scute/mcp-gateway": minor
---

The gateway serves its own tools for bringing the person in, next to the upstream server's: `scute_verify_person`, `scute_submit_code`, `scute_check_verification`, `scute_approval_status` and `scute_whoami`. They run on the signed-in person's task and are never forwarded upstream. A call that needs verification points the model at them. The gateway's tools replace upstream tools with the same names. `humanTools: false` turns them off, and `verificationMethods` limits the methods offered.
