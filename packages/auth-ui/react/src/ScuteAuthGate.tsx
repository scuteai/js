// @ts-nocheck
"use client";

import { useScuteAuthFlow, type AuthFlowView } from "./useScuteAuthFlow";

export type ScuteAuthGateProps = {
  children: React.ReactNode;
  /** Called when user becomes authenticated */
  onAuthenticated?: (user: any) => void;
  /** Custom render for each auth view. Return null to use defaults. */
  renderView?: (view: AuthFlowView, auth: ReturnType<typeof useScuteAuthFlow>) => React.ReactNode | null;
  /** Appearance customization */
  appearance?: {
    logo?: React.ReactNode;
    accentColor?: string;
    theme?: "light" | "dark";
    className?: string;
  };
};

/**
 * ScuteAuthGate — drop-in auth gate component.
 *
 * Wraps your app. Shows auth UI when not authenticated, renders children when authenticated.
 * Handles the full flow: email → magic link → passkey registration → done.
 *
 * @example
 * ```tsx
 * <ScuteAuthGate>
 *   <App />
 * </ScuteAuthGate>
 * ```
 */
export function ScuteAuthGate({ children, onAuthenticated, renderView, appearance }: ScuteAuthGateProps) {
  const auth = useScuteAuthFlow();

  // Callback when authenticated
  if (auth.isAuthenticated && auth.user && onAuthenticated) {
    onAuthenticated(auth.user);
  }

  // Authenticated — render app
  if (auth.isAuthenticated && auth.view === "authenticated") {
    return <>{children}</>;
  }

  // Custom render
  if (renderView) {
    const custom = renderView(auth.view, auth);
    if (custom !== null) return <>{custom}</>;
  }

  // Default UI
  const theme = appearance?.theme || "light";
  const accent = appearance?.accentColor || "#4F46E5";

  return (
    <div
      data-scute-auth
      data-scute-theme={theme}
      style={{ "--scute-accent": accent } as React.CSSProperties}
    >
      <div data-scute-auth-container>
        {appearance?.logo && <div data-scute-auth-logo>{appearance.logo}</div>}

        {auth.view === "loading" && <DefaultLoading />}
        {auth.view === "login" && <DefaultLogin auth={auth} />}
        {auth.view === "magic_pending" && <DefaultMagicPending auth={auth} />}
        {auth.view === "magic_verifying" && <DefaultLoading message="Verifying..." />}
        {auth.view === "otp_input" && <DefaultOtpInput auth={auth} />}
        {auth.view === "webauthn_verify" && <DefaultWebAuthnVerify />}
        {auth.view === "webauthn_register" && <DefaultWebAuthnRegister auth={auth} />}
        {auth.view === "webauthn_register_success" && <DefaultWebAuthnSuccess />}
        {auth.view === "error" && <DefaultError auth={auth} />}
      </div>
    </div>
  );
}

// ── Default views (unstyled — uses data attributes for CSS targeting) ──

function DefaultLoading({ message }: { message?: string }) {
  return <div data-scute-view="loading"><p>{message || "Loading..."}</p></div>;
}

function DefaultLogin({ auth }: { auth: ReturnType<typeof useScuteAuthFlow> }) {
  return (
    <div data-scute-view="login">
      <h2>Sign in</h2>
      <p>Enter your email to continue</p>
      <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.target as any); auth.submitIdentifier(fd.get("email") as string); }}>
        <input type="email" name="email" placeholder="you@example.com" required autoFocus data-scute-input />
        {auth.error && <p data-scute-error>{auth.error}</p>}
        <button type="submit" disabled={auth.submitting} data-scute-button="primary">
          {auth.submitting ? "Loading..." : "Continue"}
        </button>
      </form>
    </div>
  );
}

function DefaultMagicPending({ auth }: { auth: ReturnType<typeof useScuteAuthFlow> }) {
  return (
    <div data-scute-view="magic_pending">
      <h2>Check your email</h2>
      <p>We sent a magic link to <strong>{auth.identifier}</strong></p>
      <p>Click the link to sign in.</p>
      <button onClick={auth.retry} data-scute-button="secondary">Change email</button>
    </div>
  );
}

function DefaultOtpInput({ auth }: { auth: ReturnType<typeof useScuteAuthFlow> }) {
  return (
    <div data-scute-view="otp_input">
      <h2>Enter code</h2>
      <p>Code sent to <strong>{auth.identifier}</strong></p>
      <input
        type="text"
        inputMode="numeric"
        maxLength={6}
        placeholder="000000"
        data-scute-input
        onChange={(e) => {
          const val = e.target.value.replace(/\D/g, "").slice(0, 6);
          if (val.length === 6) auth.submitOtp(val);
        }}
        autoFocus
      />
      {auth.error && <p data-scute-error>{auth.error}</p>}
      <button onClick={auth.retry} data-scute-button="secondary">Try again</button>
    </div>
  );
}

function DefaultWebAuthnVerify() {
  return (
    <div data-scute-view="webauthn_verify">
      <h2>Verify your passkey</h2>
      <p>Complete the prompt in your browser.</p>
    </div>
  );
}

function DefaultWebAuthnRegister({ auth }: { auth: ReturnType<typeof useScuteAuthFlow> }) {
  return (
    <div data-scute-view="webauthn_register">
      <h2>Register a passkey</h2>
      <p>Sign in faster next time with Face ID, Touch ID, or a security key.</p>
      {auth.error && <p data-scute-error>{auth.error}</p>}
      <button onClick={auth.registerPasskey} data-scute-button="primary">Register passkey</button>
      <button onClick={auth.skipPasskey} data-scute-button="secondary">Skip for now</button>
    </div>
  );
}

function DefaultWebAuthnSuccess() {
  return (
    <div data-scute-view="webauthn_register_success">
      <h2>Passkey registered</h2>
      <p>Next time, sign in with Face ID, Touch ID, or your security key.</p>
    </div>
  );
}

function DefaultError({ auth }: { auth: ReturnType<typeof useScuteAuthFlow> }) {
  return (
    <div data-scute-view="error">
      <p data-scute-error>{auth.error}</p>
      <button onClick={auth.retry} data-scute-button="secondary">Try again</button>
    </div>
  );
}
