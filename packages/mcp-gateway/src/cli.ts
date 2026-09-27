#!/usr/bin/env node
// scute-mcp-gateway: put Scute sign-in and guardrails in front of an MCP server.
//
//   SCUTE_APP_ID=app_... SCUTE_SECRET=... \
//   MCP_RESOURCE=https://mcp.acme.io/mcp MCP_UPSTREAM=http://localhost:9000/mcp \
//   [MCP_UPSTREAM_AUTHORIZATION="Bearer ..."] [PORT=8787] [TRUST_PROXY=1] scute-mcp-gateway
import { createServer } from "node:http";
import { createGateway } from "./gateway";
import { nodeListener } from "./node";

const need = (name: string): string => {
  const v = process.env[name];
  if (!v) {
    console.error(`scute-mcp-gateway: set ${name}`);
    process.exit(1);
  }
  return v;
};

const upstreamAuth = process.env.MCP_UPSTREAM_AUTHORIZATION;
const gateway = createGateway({
  resource: need("MCP_RESOURCE"),
  upstream: { url: need("MCP_UPSTREAM"), headers: upstreamAuth ? { authorization: upstreamAuth } : undefined },
  resourceName: process.env.MCP_RESOURCE_NAME,
});
const port = Number(process.env.PORT ?? 8787);
createServer(nodeListener(gateway.handle, { trustProxy: process.env.TRUST_PROXY === "1" })).listen(port, () => {
  console.log(`scute-mcp-gateway: ${process.env.MCP_RESOURCE} -> ${process.env.MCP_UPSTREAM} on :${port}`);
});
