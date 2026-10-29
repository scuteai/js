"use client";

import { useEffect, useRef } from "react";
import { useScuteAuthFlow, type AuthFlowView } from "./useScuteAuthFlow";
import { SignInView } from "./signin/ScuteSignIn";
import type {
  ScuteSignInAppearance,
  ScuteSignInCopy,
  ScuteSignInLegal,
  ScuteSignInMethods,
} from "./signin/types";

export type ScuteAuthGateProps = {
  children: React.ReactNode;
  /** Called once each time the user becomes authenticated and the app is shown */
  onAuthenticated?: (user: any) => void;
  /** Custom render for each auth view. Return null to use defaults. */
  renderView?: (view: AuthFlowView, auth: ReturnType<typeof useScuteAuthFlow>) => React.ReactNode | null;
  /** Appearance of the sign-in (same as ScuteSignIn's). */
  appearance?: ScuteSignInAppearance;
  /** The words on the first step (same as ScuteSignIn's). */
  copy?: ScuteSignInCopy;
  /** Terms and privacy links under the form (same as ScuteSignIn's). */
  legal?: ScuteSignInLegal;
  /** Sign-in methods besides email (same as ScuteSignIn's). */
  methods?: ScuteSignInMethods;
  /** The email the field starts with (same as ScuteSignIn's). */
  defaultEmail?: string;
};

/**
 * ScuteAuthGate — drop-in auth gate component.
 *
 * Wraps your app. Shows the sign-in (ScuteSignIn) when not authenticated,
 * renders children when authenticated. Handles the full flow: email, a
 * passkey, a link or a code, MFA, then a passkey offer for next time.
 *
 * @example
 * ```tsx
 * <ScuteAuthGate appearance={{ logo: "/logo.svg" }}>
 *   <App />
 * </ScuteAuthGate>
 * ```
 */
export function ScuteAuthGate({
  children,
  onAuthenticated,
  renderView,
  appearance,
  copy,
  legal,
  methods,
  defaultEmail,
}: ScuteAuthGateProps) {
  const auth = useScuteAuthFlow();
  const isOpen = auth.isAuthenticated && auth.view === "authenticated";

  // Call onAuthenticated from an effect (not during render), once per
  // transition to authenticated. The latest prop is read through a ref so an
  // inline callback does not re-fire it.
  const onAuthenticatedRef = useRef(onAuthenticated);
  useEffect(() => {
    onAuthenticatedRef.current = onAuthenticated;
  });
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      notifiedRef.current = false;
      return;
    }
    if (notifiedRef.current || !auth.user) return;
    notifiedRef.current = true;
    onAuthenticatedRef.current?.(auth.user);
  }, [isOpen, auth.user]);

  // Authenticated — render app
  if (isOpen) {
    return <>{children}</>;
  }

  // Custom render
  if (renderView) {
    const custom = renderView(auth.view, auth);
    if (custom !== null) return <>{custom}</>;
  }

  // Default UI: the sign-in, on this gate's flow.
  return (
    <SignInView auth={auth} appearance={appearance} copy={copy} legal={legal} methods={methods} defaultEmail={defaultEmail} />
  );
}
