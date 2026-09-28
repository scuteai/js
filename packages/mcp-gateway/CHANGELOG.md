# @scute/mcp-gateway

## 0.2.0-next.1

### Patch Changes

- Updated dependencies [466dedc]
  - @scute/harness@0.2.0-next.1

## 0.2.0-next.0

### Minor Changes

- 7cd6822: The gateway serves its own tools for bringing the person in, next to the upstream server's: `scute_verify_person`, `scute_submit_code`, `scute_check_verification`, `scute_approval_status` and `scute_whoami`. They run on the signed-in person's task and are never forwarded upstream. A call that needs verification points the model at them. The gateway's tools replace upstream tools with the same names. `humanTools: false` turns them off, and `verificationMethods` limits the methods offered.
- 51278ce: New package: `@scute/mcp-gateway`. Put Scute in front of any MCP server. MCP clients sign your app's users in through Scute's OAuth server, and each user's token is traded for a task token, so every tool call runs through your `@scute/harness` guards. `tools/list` shows only what the task could use, new or changed tool definitions are held for review, and the upstream server never sees the user's token. The gateway is a standard fetch handler with a Node adapter and a `scute-mcp-gateway` CLI.

### Patch Changes

- Updated dependencies [c44094d]
- Updated dependencies [b5d7457]
- Updated dependencies [a92953c]
- Updated dependencies [48ac34d]
  - @scute/harness@0.2.0-next.0
