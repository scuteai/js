---
"@scute/mcp-gateway": patch
---

Enforce tool quarantine on `tools/call` even when the client never sent `tools/list` (the gateway lists and reports the upstream's tools itself; calls are refused while Scute can't confirm the pins). A failure while checking an upstream answer (pin report, guards, after hooks) now returns a JSON-RPC error (502 for JSON, an error event for SSE) instead of passing the unchecked upstream body through. Cached task sessions are dropped once their task token expires, a malformed token signature is a 401 instead of a 502, `nodeListener` with `trustProxy` sets the Host header to the forwarded host, internal error text is no longer echoed by `nodeListener`, and SSE events separated by a lone carriage return are parsed.
