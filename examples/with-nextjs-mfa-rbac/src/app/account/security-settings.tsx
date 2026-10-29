"use client";

import { useEffect, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useSecureAccount, type SecureMethod } from "@scute/auth-ui-react";
import { useAuth, useScuteClient } from "@scute/react-hooks";

/**
 * Setting up a second step, on top of useSecureAccount().
 *
 * useSecureAccount reads which methods your app allows (dashboard: your
 * app > Authentication > Second step (MFA) > What they can use) and which
 * this person has, and runs one enrollment at a time:
 *
 *   startEnroll(key)  ->  phase "pending_verify" (TOTP, email, text: show
 *                         the QR code or ask for the code we sent)
 *   submitCode(code)  ->  phase "verified"
 *
 * A passkey goes straight to "verified" after the browser's prompt, and
 * backup codes come back in `backupCodes`, shown once.
 */
export function SecuritySettings({ email }: { email: string }) {
  const secure = useSecureAccount();
  const scute = useScuteClient();
  const { user } = useAuth();

  // Is a second step required of this person, and are they still inside
  // the grace period? (The sign-in showed the nudge; repeat it here.)
  const [status, setStatus] = useState<{ mfa_required: boolean; in_grace_period?: boolean } | null>(null);
  useEffect(() => {
    scute.getMfaStatus().then(({ data }) => setStatus(data ?? null));
  }, [scute, secure.methods]);

  const factors = secure.methods.filter((m) => m.key !== "passkey" && m.key !== "backup_codes");
  const hasFactor = factors.some((m) => m.enrolled);

  if (secure.loading && secure.methods.length === 0) return <p className="muted">Loading</p>;

  return (
    <div className="stack">
      {status?.mfa_required && !hasFactor && (
        <p className="notice" role="status">
          This app requires a second step.{" "}
          {status.in_grace_period
            ? "You can still sign in without one for a few days: set one up now."
            : "Set one up now, or you won't be able to sign in next time."}
        </p>
      )}

      <ul className="methods">
        {secure.methods
          .filter((m) => m.allowed)
          .map((m) => (
            <MethodRow
              key={m.key}
              method={m}
              // useSecureAccount can't always tell whether a passkey exists;
              // the user record can.
              enrolled={m.key === "passkey" ? m.enrolled || !!user?.webauthn_enabled : m.enrolled}
              secure={secure}
              email={email}
            />
          ))}
      </ul>

      {secure.error && !secure.activeMethod && (
        <p role="alert" className="error">
          {secure.error.message}
        </p>
      )}
    </div>
  );
}

type Secure = ReturnType<typeof useSecureAccount>;

function MethodRow({ method, enrolled, secure, email }: { method: SecureMethod; enrolled: boolean; secure: Secure; email: string }) {
  const active = secure.activeMethod === method.key;
  const busy = secure.phase === "enrolling" || secure.phase === "verifying";

  // What the row's button does.
  async function start() {
    if (method.key === "email") return secure.startEnroll("email", { secret_data: email });
    if (method.key === "sms") return; // asks for the number first (PhoneForm)
    return secure.startEnroll(method.key);
  }

  return (
    <li className="method" data-method={method.key}>
      <div className="method-head">
        <div>
          <strong>{method.label}</strong>
          <p className="muted">{method.description}</p>
        </div>
        <span className={enrolled ? "badge on" : "badge"}>
          {method.key === "backup_codes" && enrolled ? `${method.count} left` : enrolled ? "On" : "Off"}
        </span>
      </div>

      {!active && (
        <div className="row">
          {method.key === "sms" && !enrolled ? (
            <PhoneForm onSubmit={(phone) => secure.startEnroll("sms", { secret_data: phone })} />
          ) : method.key === "backup_codes" ? (
            <button type="button" className="secondary" onClick={start}>
              {enrolled ? "Make new backup codes" : "Make backup codes"}
            </button>
          ) : !enrolled ? (
            <button type="button" className="secondary" onClick={start}>
              {method.key === "passkey" ? "Add a passkey" : "Set up"}
            </button>
          ) : method.key !== "passkey" ? (
            <button type="button" className="link-button" onClick={() => secure.removeMethod(method.key)}>
              Remove
            </button>
          ) : null}
        </div>
      )}

      {active && (
        <div className="stack enroll">
          {/* TOTP: the QR code for the authenticator app, and the key for typing in. */}
          {method.key === "totp" && secure.phase === "pending_verify" && secure.provisioningUri && (
            <>
              <p>Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
              <QRCodeSVG value={secure.provisioningUri} size={168} marginSize={2} />
              <p className="muted">
                Can&apos;t scan? Enter this key: <code data-testid="totp-secret">{secure.secret}</code>
              </p>
            </>
          )}
          {method.key === "email" && secure.phase === "pending_verify" && <p>We emailed a 6-digit code to {email}.</p>}
          {method.key === "sms" && secure.phase === "pending_verify" && <p>We texted you a 6-digit code.</p>}

          {(secure.phase === "pending_verify" || (secure.phase === "error" && method.key !== "passkey" && method.key !== "backup_codes")) && (
            <CodeForm onSubmit={secure.submitCode} busy={busy} />
          )}

          {method.key === "passkey" && secure.phase === "enrolling" && <p>Follow your browser&apos;s prompt.</p>}

          {/* Backup codes: shown once. The person saves them, then we forget them. */}
          {method.key === "backup_codes" && secure.backupCodes && (
            <>
              <p>Save these codes somewhere safe. Each works once, and you won&apos;t see them again.</p>
              <ul className="codes" data-testid="backup-codes">
                {secure.backupCodes.map((c) => (
                  <li key={c}>
                    <code>{c}</code>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => secure.cancelEnroll()}>
                I saved them
              </button>
            </>
          )}

          {secure.phase === "verified" && method.key !== "backup_codes" && (
            <>
              <p role="status">{method.label} is on.</p>
              <button type="button" onClick={() => secure.cancelEnroll()}>
                Done
              </button>
            </>
          )}

          {secure.error && (
            <p role="alert" className="error">
              {secure.error.message}
            </p>
          )}

          {secure.phase !== "verified" && !secure.backupCodes && (
            <button type="button" className="link-button" onClick={() => secure.cancelEnroll()}>
              Cancel
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function CodeForm({ onSubmit, busy }: { onSubmit: (code: string) => Promise<void>; busy: boolean }) {
  const [code, setCode] = useState("");
  return (
    <form
      className="row"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(code.trim());
      }}
    >
      <input
        aria-label="6-digit code"
        name="code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        required
      />
      <button type="submit" disabled={busy}>
        {busy ? "Checking" : "Verify"}
      </button>
    </form>
  );
}

function PhoneForm({ onSubmit }: { onSubmit: (phone: string) => void }) {
  const [phone, setPhone] = useState("");
  return (
    <form
      className="row"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(phone.trim());
      }}
    >
      <input
        aria-label="Phone number"
        name="phone"
        type="tel"
        placeholder="+1 555 123 4567"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        autoComplete="tel"
        required
      />
      <button type="submit" className="secondary">
        Text me a code
      </button>
    </form>
  );
}
