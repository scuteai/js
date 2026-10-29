---
"@scute/js-core": minor
"@scute/nextjs-handlers": minor
---

Pass the signing-in person's IP address on calls made with the secret key, so sign-ins your server starts are checked against the workspace's IP rules (sent as `X-Scute-Client-IP`):

- `clientIp` in the `ScuteClient` and `ScuteAdminApi` config, and `admin.withClientIp(ip)` for one request. One IPv4 or IPv6 address; a list or a range throws.
- `isClientIp`, `normalizeClientIp` and `SCUTE_CLIENT_IP_HEADER` are exported.
- Next.js: `createPagesServerClient` sends the address that connected to the server, and `createMiddlewareClient` and `createPagesEdgeRuntimeClient` send `request.ip` where Next.js provides it. Proxy headers are never read; pass `clientIp` to any helper to set it yourself.
