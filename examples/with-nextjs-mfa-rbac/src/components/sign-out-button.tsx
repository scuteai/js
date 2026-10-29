"use client";

import { useRouter } from "next/navigation";
import { useScuteClient } from "@scute/react-hooks";

export function SignOutButton() {
  const scute = useScuteClient();
  const router = useRouter();

  async function signOut() {
    // Ends the session at Scute and clears the session cookies (the route
    // handlers clear the httpOnly refresh cookie).
    await scute.signOut();
    router.replace("/sign-in");
    // Server components rendered for the signed-in user (like the header)
    // render again, now without a session.
    router.refresh();
  }

  return (
    <button type="button" className="link-button" onClick={signOut} data-testid="sign-out">
      Sign out
    </button>
  );
}
