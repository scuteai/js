# `@scute/js-core`

An isomorphic JavaScript client library for the Scute Auth API and Scute Management API.

## Quick start

Install

```bash
npm install --save @scute/js-core
```

## Passing the end user's IP address

When your server signs someone in with the secret key (creating a user, looking one up for sign-in, starting a challenge), Scute sees your server's address, not the person's. Pass the person's address so the sign-in is checked against your workspace's IP rules. Without it, a sign-in your server starts is not checked against IP rules, and Scute records that it was skipped.

```ts
import { ScuteAdminApi } from "@scute/js-core";

const admin = new ScuteAdminApi({ appId, secretKey: process.env.SCUTE_SECRET });

// per request
await admin.withClientIp(personIp).createUser(email);
```

A client made per request can take it once: `new ScuteClient({ appId, secretKey, clientIp: personIp })` sends it on every `client.admin` call.

The address is sent as the `X-Scute-Client-IP` header, only on calls made with the secret key. It must be one IPv4 or IPv6 address: a list (such as a raw `X-Forwarded-For` value) or a range throws, since Scute would refuse it. `null` or `undefined` sends none.

Where the address comes from is up to your server. Use the address of the connection, or, behind a proxy or load balancer you run or trust, the address that proxy reports (for example from your framework's trusted proxy setting). Never take the leftmost `X-Forwarded-For` entry as is: the browser can set it.
