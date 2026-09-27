---
"@scute/mcp-gateway": minor
---

New package: `@scute/mcp-gateway`. Put Scute in front of any MCP server. MCP clients sign your app's users in through Scute's OAuth server, and each user's token is traded for a task token, so every tool call runs through your `@scute/harness` guards. `tools/list` shows only what the task could use, new or changed tool definitions are held for review, and the upstream server never sees the user's token. The gateway is a standard fetch handler with a Node adapter and a `scute-mcp-gateway` CLI.
