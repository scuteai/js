# `@scute/nextjs-handlers`

A Next.js client library for the Scute Auth API and Management API.

## Quick start

Install

```bash
npm install --save @scute/nextjs-handlers
```

## Passing the end user's IP address

Calls made with your secret key (`SCUTE_SECRET`) come from your server, so Scute can't see the signing-in person's address. The server clients send it as `X-Scute-Client-IP`, so sign-ins your server starts are checked against your workspace's IP rules. Without it they are not checked.

What each helper sends by default:

| Helper | Address |
| --- | --- |
| `createPagesServerClient` | the address that connected to your server (`req.socket.remoteAddress`) |
| `createMiddlewareClient`, `createPagesEdgeRuntimeClient` | `request.ip`, where Next.js provides it (Next.js 14 and earlier, on platforms that set it) |
| `createRouteHandlerClient`, `createServerComponentClient`, `createServerActionClient` | none: pass `clientIp` |

Next.js has no setting for which proxies to trust, so these helpers never read `X-Forwarded-For` or `X-Real-IP`. When your app runs behind a proxy or a platform that reports the person's address, pass it yourself:

```ts
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@scute/nextjs-handlers";

export async function POST() {
  // Only a header your platform or proxy sets and the browser can't, e.g.
  // x-real-ip on Vercel.
  const clientIp = (await headers()).get("x-real-ip");
  const scute = createRouteHandlerClient({ cookies }, { clientIp });
  // ...
}
```

`clientIp` wins over the detected address, and `clientIp: null` sends none. It must be one address; a list or a range throws. For one call, `scute.admin.withClientIp(ip)` returns a copy that sends `ip`.
