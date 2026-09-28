# @scute/mcp-gateway

Put Scute in front of any MCP server:

- **Sign-in.** MCP clients (Claude, Cursor, IDEs) sign your app's users in through Scute's OAuth 2.1 server. The gateway serves the protected resource metadata (RFC 9728) and checks every access token: signature, issuer, audience, expiry.
- **Guardrails on every tool call.** Each user's token is traded for a Scute task token (RFC 8693). Every `tools/call` then runs through your [`@scute/harness`](../harness) guards: the agent's roles, the person it acts for, and the task. That covers permissions, verification, approvals, budgets and content. `tools/list` only shows what the task could use.
- **Pinned tools.** Tool definitions are hashed and reported to Scute. A tool that appears or changes is held for review until someone approves it under MCP sign-in > MCP servers.
- **No token passthrough.** The upstream server only ever sees the gateway's own credential.

## Set up in Scute

1. App > MCP sign-in: turn it on.
2. Add this gateway's public URL as an MCP server (for example `https://mcp.acme.io/mcp`).
3. Link MCP clients to an agent, or set a default agent. The agent's roles are the most a client can do.

## Run it

```sh
SCUTE_APP_ID=app_... SCUTE_SECRET=... \
MCP_RESOURCE=https://mcp.acme.io/mcp \
MCP_UPSTREAM=http://localhost:9000/mcp \
MCP_UPSTREAM_AUTHORIZATION="Bearer <upstream key>" \
npx @scute/mcp-gateway
```

Or in your own server (any runtime with `fetch`):

```ts
import { createGateway, nodeListener } from "@scute/mcp-gateway";
import { guards } from "@scute/harness";
import { createServer } from "node:http";

const gateway = createGateway({
  resource: "https://mcp.acme.io/mcp",
  upstream: { url: "http://localhost:9000/mcp", headers: { authorization: `Bearer ${process.env.UPSTREAM_KEY}` } },
  guards: [guards.permissions(), guards.content()],
});

createServer(nodeListener(gateway.handle)).listen(8787);
// Next.js route handler: export const POST = gateway.handle; export const GET = gateway.handle;
```

## Scopes and step-up

Map scopes to permissions on the MCP server in Scute (for example `tools:write -> invoice:refund`). When a call needs a scope the token doesn't have, the gateway answers `403` with `WWW-Authenticate: Bearer error="insufficient_scope"`, and the client asks the user again with more scope.

## Bringing the person in

Next to your server's tools, the gateway lists its own tools and answers them itself (never forwarding them to your server). Each one works with the signed-in person's task, and every answer has a `say` line for the model to pass on:

- `scute_verify_person`: send them a code or a push (method: `email_otp`, `sms_otp`, `totp`, `entra_push`; change the list with `verificationMethods`)
- `scute_submit_code`: pass on the code they read out
- `scute_check_verification`: check a push or a link
- `scute_approval_status`: check a reviewer's answer
- `scute_whoami`: who the task works for, what it may do, and what needs verification or approval

When a tool call needs verification, the model is told to use `scute_verify_person` and then try again. If your server has a tool with one of these names, the gateway's version replaces it. Turn them all off with `humanTools: false`.

Signing in isn't a tool: the MCP client signs the person in when it connects (OAuth), and asks for more access when a tool needs it (`insufficient_scope`).

## Notes

- Tool pinning checks the definitions it has seen in `tools/list`. Keep pinning on (`pinning: true`, the default) and review held tools in Scute.
- JSON-RPC batches that contain `tools/*` requests are refused; send them one at a time (MCP 2025-06-18 dropped batching).
