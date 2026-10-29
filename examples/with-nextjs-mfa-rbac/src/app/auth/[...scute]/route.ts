// The Scute route handlers: /auth/csrf, /auth/sign-in, /auth/refresh and
// /auth/sign-out. The browser client calls them to move the refresh token
// into an httpOnly cookie, refresh the session and clear it on sign-out.
// Keep this file at app/auth/[...scute]/route.ts.

import { cookies, headers } from "next/headers";
import { ScuteHandler } from "@scute/nextjs-handlers";

const handler = ScuteHandler({ cookies, headers });

export { handler as GET, handler as POST };
