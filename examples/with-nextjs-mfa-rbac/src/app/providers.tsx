"use client";

// The Scute client for the browser, created once and shared through React
// context. Every Scute hook and component below this provider uses it.

import { useState, type ReactNode } from "react";
import { createClientComponentClient } from "@scute/nextjs-handlers";
import { AuthContextProvider } from "@scute/react-hooks";

export function Providers({ children }: { children: ReactNode }) {
  // useState with an initializer: one client for the life of the page, not
  // a new one on every render.
  const [scuteClient] = useState(() =>
    // The Next.js flavour of the client keeps the session in cookies, so
    // server components and route handlers can read it too (see
    // src/lib/session.ts), and it keeps the refresh token in an httpOnly
    // cookie through the handlers in src/app/auth/[...scute]/route.ts.
    createClientComponentClient({
      appId: process.env.NEXT_PUBLIC_SCUTE_APP_ID,
      baseUrl: process.env.NEXT_PUBLIC_SCUTE_BASE_URL,
    })
  );

  return <AuthContextProvider scuteClient={scuteClient}>{children}</AuthContextProvider>;
}
