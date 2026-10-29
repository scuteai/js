"use client";

import { useRouter } from "next/navigation";
import { ScuteSignIn } from "@scute/auth-ui-react";

/**
 * The drop-in sign-in. It runs the whole flow your dashboard settings ask
 * for, with nothing to wire up:
 *
 * - email, then a passkey, a sign-in link or a 6-digit code
 * - the second step when MFA is on: authenticator app, email or text
 *   code, or a backup code, with "Or use another way" to switch
 * - the grace-period nudge ("Set up two-step verification") when MFA is
 *   required and this person has none set up yet
 * - an offer to add a passkey after a link or a code
 * - clear refusals (banned, blocked by IP or country rules, and so on)
 *
 * onSignedIn runs once the flow has finished (after the second step, the
 * nudge or the passkey offer).
 */
export function SignIn({ next }: { next: string }) {
  const router = useRouter();

  return (
    <ScuteSignIn
      appearance={{ layout: "card", theme: "auto" }}
      copy={{ title: "Sign in to Acme" }}
      onSignedIn={() => {
        router.replace(next);
        // Render the server components again with the new session cookies.
        router.refresh();
      }}
    />
  );
}
