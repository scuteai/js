// Reading the session on the server.
//
// createServerComponentClient reads the session cookies the browser client
// wrote and asks Scute who they belong to. Use it in server components,
// layouts and pages. It never refreshes a token (server components can't
// set cookies); the browser client does that.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@scute/nextjs-handlers";

/** The signed-in user, or null. */
export async function getSignedInUser() {
  // Reading the cookies first also tells Next.js that every page using
  // this renders per request (never prerendered at build time).
  const cookieStore = await cookies();
  const scute = createServerComponentClient({ cookies: () => cookieStore });
  const { data, error } = await scute.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

/**
 * The signed-in user, or a redirect to the sign-in page. Call it at the top
 * of any page only signed-in people may see.
 */
export async function requireUser(next: string) {
  const user = await getSignedInUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return user;
}
