"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ScuteAuthGate, type ScuteAuthFlow } from "@scute/auth-ui-react";

/**
 * The headless way, for one step.
 *
 * ScuteAuthGate runs the same flow as ScuteSignIn. With `renderView` you
 * draw any step yourself and keep the default for the rest: return your
 * element for the steps you own, null for the others. Here the app draws
 * the MFA step ("mfa_verify"), with plain HTML and the flow's actions.
 *
 * To draw every step, use the useScuteAuthFlow() hook directly: `auth`
 * below is its result.
 */
export default function CustomSignInPage() {
  const router = useRouter();

  return (
    <ScuteAuthGate
      appearance={{ layout: "card", theme: "auto" }}
      copy={{ title: "Sign in (custom second step)" }}
      renderView={(view, auth) => (view === "mfa_verify" ? <MyMfaStep auth={auth} /> : null)}
      onAuthenticated={() => {
        router.replace("/account");
        router.refresh();
      }}
    >
      <p>Signed in. Taking you to your account.</p>
    </ScuteAuthGate>
  );
}

// The challenge's method, as the person reads it.
const LABELS: Record<string, string> = {
  totp: "Authenticator app",
  email_otp: "Email code",
  sms_otp: "Text message code",
  backup_code: "Backup code",
};

// mfaAvailableMethods uses the enrollment names ("email", "backup_codes");
// switchMfaMethod takes the challenge names ("email_otp", "backup_code").
const CHALLENGE_METHOD: Record<string, string> = {
  totp: "totp",
  email: "email_otp",
  sms: "sms_otp",
  backup_codes: "backup_code",
};

function MyMfaStep({ auth }: { auth: ScuteAuthFlow }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sideError, setSideError] = useState<string | null>(null);

  // The pending challenge: its method, and whether a code was sent
  // (email and text) so it can be sent again.
  const method: string = auth.mfaChallenge?.method ?? "totp";
  const isBackupCode = method === "backup_code";
  const others = auth.mfaAvailableMethods
    .map((m) => CHALLENGE_METHOD[m])
    .filter((m): m is string => !!m && m !== method);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSideError(null);
    // true: signed in. The gate then shows its children and calls
    // onAuthenticated. false: auth.error says why.
    await auth.submitMfaCode(code.trim());
    setBusy(false);
  }

  async function switchTo(next: string) {
    setCode("");
    // Returns an error message, or null when the new challenge is ready.
    setSideError(await auth.switchMfaMethod(next));
  }

  return (
    <form onSubmit={submit} className="card stack" aria-labelledby="mfa-title">
      <h1 id="mfa-title">Confirm it&apos;s you</h1>
      <p>
        {isBackupCode
          ? "Enter one of your 8-character backup codes."
          : `Enter the 6-digit code from your ${(LABELS[method] ?? method).toLowerCase()}.`}
      </p>
      <label className="field">
        <span>{LABELS[method] ?? "Code"}</span>
        <input
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode={isBackupCode ? "text" : "numeric"}
          autoComplete="one-time-code"
          maxLength={isBackupCode ? 8 : 6}
          autoFocus
          required
        />
      </label>
      {(auth.error || sideError) && (
        <p role="alert" className="error">
          {sideError ?? auth.error}
        </p>
      )}
      <button type="submit" disabled={busy || code.trim().length === 0}>
        {busy ? "Checking" : "Verify"}
      </button>

      {auth.mfaChallenge?.delivery_required && (
        <button type="button" className="link-button" onClick={async () => setSideError(await auth.resendMfaCode())}>
          {auth.mfaResent ? "Sent. Send another code" : "Send the code again"}
        </button>
      )}

      {others.length > 0 && (
        <div className="stack">
          <p className="muted">Or use another way</p>
          {others.map((m) => (
            <button key={m} type="button" className="secondary" disabled={auth.mfaSwitching} onClick={() => switchTo(m)}>
              {LABELS[m] ?? m}
            </button>
          ))}
        </div>
      )}

      <button type="button" className="link-button" onClick={auth.retry}>
        Use a different email
      </button>
    </form>
  );
}
