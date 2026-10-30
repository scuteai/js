"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { APP_SETTINGS_UNAVAILABLE, useScuteAuthFlow } from "../useScuteAuthFlow";
import { errorText, failureFor, isBackupCode, MFA_LABELS, MFA_LEADS, MFA_SETUP_LABELS, REFUSALS, switchableMethod } from "./messages";
import {
  Button,
  CodeBoxes,
  ErrorBox,
  FocusContext,
  GoogleIcon,
  Icon,
  Lead,
  PreviewContext,
  StepContext,
  TextButton,
  Title,
  Token,
  Waiting,
  useInPreview,
  type StepInfo,
} from "./parts";
import { previewFlow, previewOf } from "./preview";
import { SIGN_IN_CSS } from "./styles";
import { themeVars } from "./theme";
import type { ScuteSignInMood, ScuteSignInProps } from "./types";

/** The sign-in flow state the component renders (from useScuteAuthFlow). */
export type ScuteAuthFlow = ReturnType<typeof useScuteAuthFlow>;

/**
 * ScuteSignIn: the complete sign-in, ready to drop in.
 *
 * Email first, then whatever the app is set up for: a passkey, a magic
 * link or a 6-digit code, MFA, and a passkey offer for next time. Styled by
 * its own scoped stylesheet (no CSS import, no Tailwind needed) and themed
 * with `appearance`. Needs the Scute AuthContextProvider above it, except
 * with `preview` (one step drawn with sample data, no client).
 *
 * @example
 * ```tsx
 * <ScuteSignIn
 *   appearance={{ logo: "/logo.svg", accentColor: "#0f766e", theme: "auto" }}
 *   legal={{ termsUrl: "/terms", privacyUrl: "/privacy" }}
 *   onSignedIn={() => router.push("/")}
 * />
 * ```
 */
export function ScuteSignIn({ preview, ...props }: ScuteSignInProps) {
  return preview ? <PreviewSignIn preview={preview} {...props} /> : <LiveSignIn {...props} />;
}

// The `preview` prop: one step with sample data, on a flow that does
// nothing. A new step or new sample data starts the step afresh.
function PreviewSignIn({ preview, onSignedIn: _unused, ...props }: ScuteSignInProps & { preview: NonNullable<ScuteSignInProps["preview"]> }) {
  const p = previewOf(preview);
  const stepKey = [p.view, p.email, p.error, p.errorCode, p.mfaMethod, p.verificationMethod].join("|");
  return <SignInView auth={previewFlow(p)} preview stepKey={stepKey} {...props} />;
}

function LiveSignIn({ onSignedIn, ...props }: Omit<ScuteSignInProps, "preview">) {
  const auth = useScuteAuthFlow();

  // Once per sign-in, from an effect (not during render); the latest prop
  // is read through a ref so an inline callback does not re-fire it.
  const onSignedInRef = useRef(onSignedIn);
  useEffect(() => {
    onSignedInRef.current = onSignedIn;
  });
  const notifiedRef = useRef(false);
  const signedIn = auth.isAuthenticated && auth.view === "authenticated";
  useEffect(() => {
    if (!signedIn) {
      notifiedRef.current = false;
      return;
    }
    if (notifiedRef.current || !auth.user) return;
    notifiedRef.current = true;
    onSignedInRef.current?.(auth.user);
  }, [signedIn, auth.user]);

  return <SignInView auth={auth} {...props} />;
}

const MOODS: Record<string, ScuteSignInMood> = {
  loading: "idle",
  login: "idle",
  magic_pending: "checking",
  magic_verifying: "working",
  verification_required: "locked",
  otp_input: "checking",
  webauthn_verify: "locked",
  webauthn_register: "success",
  webauthn_register_success: "success",
  mfa_verify: "locked",
  mfa_enroll: "locked",
  mfa_enroll_suggest: "success",
  contact_verify: "locked",
  challenge_completed: "success",
  error: "error",
  authenticated: "success",
};

const ICONS: Record<string, string> = {
  loading: "user",
  login: "user",
  magic_pending: "mail",
  magic_verifying: "mail",
  verification_required: "shield",
  otp_input: "mail",
  webauthn_verify: "key",
  webauthn_register: "key",
  webauthn_register_success: "check",
  mfa_verify: "lock",
  mfa_enroll: "lock",
  mfa_enroll_suggest: "shield",
  contact_verify: "mail",
  challenge_completed: "check",
  error: "alert",
  authenticated: "check",
};

/**
 * The sign-in, drawn from a flow you already hold (ScuteAuthGate passes
 * its own, so there's one flow). @internal
 */
export function SignInView({
  auth,
  appearance = {},
  copy = {},
  legal = {},
  methods = {},
  defaultEmail,
  preview = false,
  stepKey,
}: Omit<ScuteSignInProps, "onSignedIn" | "preview"> & { auth: ScuteAuthFlow; preview?: boolean; stepKey?: string }) {
  const { theme = "light", radius = "medium", layout = "page", className, logo, illustration } = appearance;
  const vars = useMemo(() => themeVars(appearance), [appearance.accentColor, appearance.fontFamily]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each failed attempt counts, so a custom illustration can shake on it.
  const [errorCount, setErrorCount] = useState(0);
  useEffect(() => {
    if (auth.error) setErrorCount((n) => n + 1);
  }, [auth.error]);

  const view = auth.view;
  const mood: ScuteSignInMood = auth.error || view === "error"
    ? "error"
    : view === "login" && auth.submitting
      ? "working"
      : MOODS[view] ?? "idle";
  const step: StepInfo = { view, mood, errorCount };
  const focusShown = useRef(false);
  // Set once an email was sent, so "Use a different email" starts empty.
  const defaultEmailUsed = useRef(false);

  return (
    <div
      data-scute-auth
      data-scute-signin
      data-scute-theme={theme}
      data-scute-layout={layout}
      data-scute-radius={radius}
      className={`scute-signin${className ? ` ${className}` : ""}`}
      style={vars}
    >
      <style>{SIGN_IN_CSS}</style>
      <StepContext.Provider value={step}>
        <PreviewContext.Provider value={preview}>
          <FocusContext.Provider value={focusShown}>
            {logo && (
              <div className="scute-signin__logo" data-scute-auth-logo>
                {typeof logo === "string" ? <img src={logo} alt="" /> : logo}
              </div>
            )}
            {illustration !== false && (
              <div className="scute-signin__illustration" aria-hidden={illustration === undefined || undefined}>
                {illustration ?? (
                  <span className="scute-signin__icon" data-mood={mood}>
                    <Icon name={ICONS[view] ?? "user"} />
                  </span>
                )}
              </div>
            )}
            <main className="scute-signin__main" data-scute-auth-container>
              <div key={stepKey ?? view} className="scute-signin__step" data-scute-view={view}>
                <Step auth={auth} copy={copy} methods={methods} defaultEmail={defaultEmail} defaultEmailUsed={defaultEmailUsed} />
              </div>
            </main>
            <Legal {...legal} />
          </FocusContext.Provider>
        </PreviewContext.Provider>
      </StepContext.Provider>
    </div>
  );
}

function Legal({ termsUrl, privacyUrl }: { termsUrl?: string; privacyUrl?: string }) {
  if (!termsUrl && !privacyUrl) return null;
  const privacy = privacyUrl && (
    <a className="scute-signin__link" href={privacyUrl} target="_blank" rel="noreferrer">Privacy Policy</a>
  );
  const terms = termsUrl && (
    <a className="scute-signin__link" href={termsUrl} target="_blank" rel="noreferrer">Terms</a>
  );
  return (
    <footer className="scute-signin__legal">
      By continuing you agree to the {privacy}
      {privacy && terms && " and "}
      {terms}.
    </footer>
  );
}

type EmailDefault = { defaultEmail?: string; defaultEmailUsed: { current: boolean } };

function Step({ auth, copy, methods, ...email }: { auth: ScuteAuthFlow } & Pick<ScuteSignInProps, "copy" | "methods"> & EmailDefault) {
  const preview = useInPreview();
  switch (auth.view) {
    case "loading":
      return <Waiting center>Loading</Waiting>;
    case "login":
      return <EmailStep auth={auth} copy={copy ?? {}} google={!!methods?.google} {...email} />;
    case "magic_pending":
      return <InboxStep auth={auth} />;
    case "magic_verifying":
      return (
        <>
          <Title>Signing you in</Title>
          <Lead>Checking your sign-in link. This only takes a moment.</Lead>
          <Waiting>Checking the link</Waiting>
        </>
      );
    case "verification_required":
      return <VerificationStep auth={auth} />;
    case "otp_input":
      return <CodeStep auth={auth} />;
    case "webauthn_verify":
      return (
        <>
          <Title>Use your passkey</Title>
          <Lead>
            Follow your browser&apos;s prompt to sign in{auth.identifier ? <> as <Token>{auth.identifier}</Token></> : null}.
            {" "}Cancel it and we will send a link or a code instead.
          </Lead>
          <Waiting>Waiting for your passkey</Waiting>
          <Different auth={auth} />
        </>
      );
    case "webauthn_register":
      return <AddPasskeyStep auth={auth} />;
    case "webauthn_register_success":
      return (
        <>
          <Title>Passkey added</Title>
          <Lead>Next time, sign in with it instead of your email.</Lead>
          <Waiting>Finishing up</Waiting>
        </>
      );
    case "mfa_verify":
      return auth.mfaChallenge ? (
        <MfaStep auth={auth} />
      ) : (
        <FailureStep
          auth={auth}
          failure={{
            title: "We couldn't start the second step",
            message: "Your account asks for a second step, but it didn't load. Start again from your email.",
          }}
        />
      );
    case "mfa_enroll":
      return <MfaSetupStep auth={auth} />;
    case "contact_verify":
      return <ContactStep auth={auth} />;
    case "challenge_completed":
      return (
        <>
          <Title>Verified</Title>
          <Lead>You can close this page and go back to where you were.</Lead>
        </>
      );
    case "mfa_enroll_suggest":
      // Setting one up right here with the new session (D17).
      if (auth.mfaSetup && !auth.mfaSetup.setupToken) {
        return auth.mfaSetup.method && auth.mfaSetup.enrollmentId
          ? <MfaSetupCode auth={auth} setup={auth.mfaSetup} />
          : <MfaSetupChoose auth={auth} setup={auth.mfaSetup} />;
      }
      if (auth.mfaFactorNotAllowed) {
        const canSetUp = auth.mfaAvailableMethods.some((m) => m === "totp" || m === "sms" || m === "email");
        return (
          <>
            <Title>Set up another second step</Title>
            <Lead>You&apos;re signed in. This app no longer accepts your second step. Set up another one.</Lead>
            {canSetUp && (
              <Button variant="primary" autoFocus={!preview} onClick={auth.setUpMfaNow} className="scute-signin__mt-28">
                Set one up
              </Button>
            )}
            <Button variant={canSetUp ? undefined : "primary"} autoFocus={!preview && !canSetUp} onClick={auth.skipMfaEnrollment}
                    className={canSetUp ? "scute-signin__mt-12" : "scute-signin__mt-28"}>
              Continue
            </Button>
          </>
        );
      }
      return (
        <>
          <Title>Set up two-step verification</Title>
          <Lead>
            You&apos;re signed in. Your account will soon need a second step to sign in
            {typeof auth.mfaGraceDaysRemaining === "number"
              ? ` (in ${auth.mfaGraceDaysRemaining} day${auth.mfaGraceDaysRemaining === 1 ? "" : "s"})`
              : ""}
            . Set one up in your account settings.
          </Lead>
          <Button variant="primary" autoFocus={!preview} onClick={auth.skipMfaEnrollment} className="scute-signin__mt-28">
            Continue
          </Button>
        </>
      );
    case "error":
      return <FailureStep auth={auth} failure={failureFor(auth.error, auth.errorCode)} />;
    case "authenticated":
      return (
        <>
          <Title>You&apos;re in</Title>
          <Lead>
            {auth.user?.email ? <>Signed in as <Token>{auth.user.email}</Token>.</> : "You're signed in."}
          </Lead>
        </>
      );
    default:
      return null;
  }
}

// ── Steps ──

// The first step's field, for what the app takes: email, a phone number, or either.
const FIELDS = {
  email: {
    label: "Email",
    placeholder: "name@company.com",
    type: "email",
    autoComplete: "email webauthn",
    subtitle: "Enter your email and we will send you a link or a code. No account yet? This makes one.",
  },
  phone: {
    label: "Phone number",
    placeholder: "+1 555 123 4567",
    type: "tel",
    autoComplete: "tel webauthn",
    subtitle: "Enter your phone number and we will text you a code. No account yet? This makes one.",
  },
  either: {
    label: "Email or phone number",
    placeholder: "name@company.com or +1 555 123 4567",
    type: "text",
    autoComplete: "username webauthn",
    subtitle: "Enter your email or phone number and we will send you a link or a code. No account yet? This makes one.",
  },
} as const;

const fieldFor = (types: ReadonlyArray<string> | undefined) => {
  const phone = !!types?.includes("phone");
  const email = !types?.length || types.includes("email");
  return FIELDS[phone && email ? "either" : phone ? "phone" : "email"];
};

// The first step's lead, for what the app sends by email once known
// (email_auth_type): a link or a code, not both.
const EMAIL_SUBTITLES = {
  email: {
    link: "Enter your email and we will send you a sign-in link. No account yet? This makes one.",
    code: "Enter your email and we will send you a sign-in code. No account yet? This makes one.",
  },
  either: {
    link: "Enter your email or phone number. We will email you a sign-in link or text you a code. No account yet? This makes one.",
    code: "Enter your email or phone number and we will send you a sign-in code. No account yet? This makes one.",
  },
} as const;

const subtitleFor = (field: (typeof FIELDS)[keyof typeof FIELDS], emailSignIn: "link" | "code" | null | undefined) => {
  if (!emailSignIn) return field.subtitle;
  if (field === FIELDS.email) return EMAIL_SUBTITLES.email[emailSignIn];
  if (field === FIELDS.either) return EMAIL_SUBTITLES.either[emailSignIn];
  return field.subtitle;
};

/** "Use a different email" (or number), for the identifier this sign-in used. */
function Different({ auth }: { auth: ScuteAuthFlow }) {
  const number = !!auth.identifier && !auth.identifier.includes("@");
  return <TextButton onClick={auth.retry}>{number ? "Use a different number" : "Use a different email"}</TextButton>;
}

function EmailStep({ auth, copy, google, defaultEmail, defaultEmailUsed }: {
  auth: ScuteAuthFlow; copy: NonNullable<ScuteSignInProps["copy"]>; google: boolean;
} & EmailDefault) {
  const preview = useInPreview();
  const [email, setEmail] = useState(() => auth.identifier || (defaultEmailUsed.current ? "" : defaultEmail ?? ""));
  const edited = useRef(false);
  // A default that arrives once the step is showing (read on the client
  // from the URL or a cookie) fills the field until the visitor types.
  useEffect(() => {
    if (defaultEmail && !edited.current && !auth.identifier && !defaultEmailUsed.current) setEmail(defaultEmail);
  }, [defaultEmail]); // eslint-disable-line react-hooks/exhaustive-deps
  const error = errorText(auth.error, auth.errorCode);
  const busy = auth.submitting;
  const field = fieldFor(auth.identifierTypes);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const value = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!value) return;
    defaultEmailUsed.current = true;
    auth.submitIdentifier(value);
  };

  return (
    <>
      <form onSubmit={submit}>
        <Title focus={false}>{copy.title ?? "Sign in"}</Title>
        <Lead>{copy.subtitle ?? subtitleFor(field, auth.emailSignIn)}</Lead>
        <label htmlFor="scute-signin-email" className="scute-signin__label">{copy.emailLabel ?? field.label}</label>
        <input
          id="scute-signin-email"
          name="email"
          type={field.type}
          autoComplete={field.autoComplete}
          autoFocus={!preview}
          required
          placeholder={copy.emailPlaceholder ?? field.placeholder}
          value={email}
          readOnly={busy}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? "scute-signin-email-error" : undefined}
          onChange={(e) => {
            edited.current = true;
            setEmail(e.target.value);
          }}
          className="scute-signin__input"
          data-scute-input
        />
        {error && <ErrorBox id="scute-signin-email-error">{error}</ErrorBox>}
        <Button type="submit" variant="primary" busy={busy} className="scute-signin__mt-24">
          {copy.continueLabel ?? "Continue"}
        </Button>
      </form>
      {google && (
        <>
          <div className="scute-signin__or" aria-hidden="true">or</div>
          <Button disabled={busy} onClick={() => auth.signInWithOAuth("google")}>
            <GoogleIcon />
            Continue with Google
          </Button>
        </>
      )}
    </>
  );
}

/** "Send a new link" (or code) with the wait on its label, and a quiet line once it went out. */
function Resend({ auth, what, className }: { auth: ScuteAuthFlow; what: "link" | "code"; className: string }) {
  const { resendIn, resending, resent, resendError } = auth;
  return (
    <>
      <Button busy={resending} disabled={resendIn > 0} onClick={() => auth.resend()} className={className}>
        {resending ? "Sending" : resendIn > 0 ? `Send a new ${what} in ${resendIn}s` : `Send a new ${what}`}
      </Button>
      {resendError ? (
        <ErrorBox>{errorText(resendError, null)}</ErrorBox>
      ) : (
        <p role="status" className="scute-signin__status">
          {resent && <>We sent a new {what} to <Token>{auth.identifier}</Token>.</>}
        </p>
      )}
    </>
  );
}

function InboxStep({ auth }: { auth: ScuteAuthFlow }) {
  // The link was opened on another device that is finishing its own steps (D2).
  if (auth.finishingOnOtherDevice) {
    return (
      <>
        <Title>Finish on the other device</Title>
        <Lead>Finish signing in on the device where you opened the link. This page signs you in once you&apos;re done.</Lead>
        <Waiting>Waiting for the other device</Waiting>
        <Different auth={auth} />
      </>
    );
  }
  return (
    <>
      <Title>Check your inbox</Title>
      <Lead>
        We sent a sign-in link to <Token>{auth.identifier}</Token>. Open it on any device and this page signs you in.
      </Lead>
      <Waiting>Waiting for you to open the link</Waiting>
      <Resend auth={auth} what="link" className="scute-signin__mt-28" />
      <Different auth={auth} />
    </>
  );
}

const blank = (length: number) => new Array<string>(length).fill("");

// Why a code was refused: a sign-in refusal says so, anything else is a
// wrong code.
const wrongCode = (auth: ScuteAuthFlow, fallback: string) =>
  auth.errorCode && REFUSALS[auth.errorCode] ? REFUSALS[auth.errorCode].message : fallback;

// The code boxes, their Verify button and the wrong-code state, for every
// code a sign-in asks for. Sends itself once the last box is filled. A
// preview with an error starts on the wrong-code state.
function useCode(length: number, submit: (code: string) => Promise<boolean>, error: string | null) {
  const preview = useInPreview();
  const [code, setCode] = useState(() => blank(length));
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(preview && !!error);
  const [focusKey, setFocusKey] = useState(0);
  const submitting = useRef(false);
  // Set again on every mount: StrictMode (and a remount) runs the cleanup
  // once without the component going away, and a ref left false would keep
  // the boxes on "Checking" forever after a wrong code.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const verify = async (chars: string[]) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    const ok = await submit(chars.join(""));
    submitting.current = false;
    if (!mounted.current) return;
    setBusy(false);
    if (!ok) {
      setWrong(true);
      setCode(blank(length));
      setFocusKey((n) => n + 1);
    }
  };

  const onChange = (next: string[]) => {
    setCode(next);
    setWrong(false);
    if (next.every((c) => c !== "")) verify(next);
  };

  const reset = (nextLength = length) => {
    setCode(blank(nextLength));
    setWrong(false);
    setFocusKey((n) => n + 1);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy && code.every((c) => c !== "")) verify(code);
  };

  return { code, busy, wrong, focusKey, onChange, onSubmit, reset, full: code.every((c) => c !== "") };
}

function VerifyButton({ busy, full }: { busy: boolean; full: boolean }) {
  return (
    <Button type="submit" variant="primary" busy={busy} disabled={!busy && !full} className="scute-signin__mt-24">
      {busy ? "Checking" : "Verify"}
    </Button>
  );
}

function CodeStep({ auth }: { auth: ScuteAuthFlow }) {
  const c = useCode(6, auth.submitOtp, auth.error);
  return (
    <form onSubmit={c.onSubmit}>
      <Title focus={false}>Enter the code</Title>
      <Lead>We sent a 6-digit code to <Token>{auth.identifier}</Token>.</Lead>
      <CodeBoxes label="Sign-in code" value={c.code} disabled={c.busy} invalid={c.wrong} focusKey={c.focusKey}
                 onChange={c.onChange} describedBy={c.wrong ? "scute-signin-code-error" : undefined} />
      {c.wrong && (
        <ErrorBox id="scute-signin-code-error">
          {wrongCode(auth, "That code didn't work. Check the email and try again.")}
        </ErrorBox>
      )}
      <VerifyButton busy={c.busy} full={c.full} />
      <Resend auth={auth} what="code" className="scute-signin__mt-12" />
      <Different auth={auth} />
    </form>
  );
}

function VerificationStep({ auth }: { auth: ScuteAuthFlow }) {
  const c = useCode(6, auth.submitVerificationCode, auth.error);
  const byText = auth.verification?.method === "sms_otp";
  return (
    <form onSubmit={c.onSubmit}>
      <Title focus={false}>Confirm it&apos;s you</Title>
      <Lead>
        This sign-in is from a new device or place, so we sent a 6-digit code {byText ? "by text message" : "to your email"}.
        Enter it to go on.
      </Lead>
      <CodeBoxes label="Verification code" value={c.code} disabled={c.busy} invalid={c.wrong} focusKey={c.focusKey}
                 onChange={c.onChange} describedBy={c.wrong ? "scute-signin-verification-error" : undefined} />
      {c.wrong && (
        <ErrorBox id="scute-signin-verification-error">
          {wrongCode(auth, "That code didn't work. Check it and try again.")}
        </ErrorBox>
      )}
      <VerifyButton busy={c.busy} full={c.full} />
      <Different auth={auth} />
    </form>
  );
}

function MfaStep({ auth }: { auth: ScuteAuthFlow }) {
  const method: string = auth.mfaChallenge?.method ?? "totp";
  const length = isBackupCode(method) ? 8 : 6;
  const c = useCode(length, auth.submitMfaCode, auth.error);
  // A new method (or a new code for it) starts with empty boxes.
  const lastMethod = useRef(method);
  useEffect(() => {
    if (lastMethod.current !== method) {
      lastMethod.current = method;
      c.reset(isBackupCode(method) ? 8 : 6);
    }
  });
  const label = MFA_LABELS[method] ?? method;
  const current = switchableMethod(method);
  const others = Array.from(
    new Set(
      (auth.mfaAvailableMethods ?? [])
        .map((m: string) => switchableMethod(m))
        .filter((m): m is string => !!m && m !== current)
    )
  );
  const canResend = !!auth.mfaChallenge?.delivery_required;
  // A resend or a switch that failed.
  const [sideError, setSideError] = useState<string | null>(null);
  const resend = async () => setSideError(await auth.resendMfaCode());
  const switchTo = async (m: string) => setSideError(await auth.switchMfaMethod(m));
  const shownError = c.wrong ? wrongCode(auth, "That code didn't work. Try again.") : sideError ? errorText(sideError, null) : null;

  return (
    <form onSubmit={c.onSubmit}>
      <Title focus={false}>One more step</Title>
      <Lead>{MFA_LEADS[method] ?? `Enter the code from your ${label.toLowerCase()}.`}</Lead>
      {auth.deviceTrustOffered && (
        // Before the boxes: the code sends itself once the last box is filled.
        <label className="scute-signin__check">
          <input type="checkbox" checked={!!auth.trustDevice} disabled={c.busy}
                 onChange={(e) => auth.setTrustDevice(e.target.checked)} />
          {trustDeviceLabel(auth.deviceTrustDays)}
        </label>
      )}
      <CodeBoxes key={method} label={label} value={c.code.length === length ? c.code : blank(length)} numeric={!isBackupCode(method)}
                 disabled={c.busy} invalid={c.wrong} focusKey={c.focusKey} onChange={c.onChange}
                 describedBy={shownError ? "scute-signin-mfa-error" : undefined} />
      {shownError && <ErrorBox id="scute-signin-mfa-error">{shownError}</ErrorBox>}
      <VerifyButton busy={c.busy} full={c.full} />
      {canResend && (
        <p className="scute-signin__status" role="status">
          {auth.mfaResent ? "We sent a new code. " : "No code? "}
          <button type="button" className="scute-signin__text-btn scute-signin__inline-btn" onClick={resend}>
            Send {auth.mfaResent ? "another" : "it again"}
          </button>
        </p>
      )}
      {others.length > 0 && (
        <div className="scute-signin__others">
          <p className="scute-signin__others-label" id="scute-signin-others">Or use another way</p>
          <div className="scute-signin__others-list" role="group" aria-labelledby="scute-signin-others">
            {others.map((m) => (
              <Button key={m} align="start" disabled={auth.mfaSwitching || c.busy} onClick={() => switchTo(m)}>
                {MFA_LABELS[m] ?? m}
              </Button>
            ))}
          </div>
        </div>
      )}
      <Different auth={auth} />
    </form>
  );
}

function trustDeviceLabel(days: number | null | undefined) {
  if (!days) return "Trust this device";
  return `Trust this device for ${days} day${days === 1 ? "" : "s"}`;
}

function AddPasskeyStep({ auth }: { auth: ScuteAuthFlow }) {
  const [busy, setBusy] = useState<"add" | "skip" | null>(null);
  const error = auth.error ? errorText(auth.error, auth.errorCode) : null;
  const run = async (which: "add" | "skip") => {
    if (busy) return;
    setBusy(which);
    try {
      await (which === "add" ? auth.registerPasskey() : auth.skipPasskey());
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <Title>Add a passkey</Title>
      <Lead>
        You&apos;re signed in. Next time, skip the email: sign in with Touch ID, Face ID, Windows Hello or a security key.
      </Lead>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Button variant="primary" busy={busy === "add"} disabled={!!busy} onClick={() => run("add")} className="scute-signin__mt-28">
        <Icon name="key" size={16} />
        {busy === "add" ? "Adding passkey" : "Add a passkey"}
      </Button>
      <Button busy={busy === "skip"} disabled={!!busy} onClick={() => run("skip")} className="scute-signin__mt-12">
        Skip for now
      </Button>
    </>
  );
}

function FailureStep({ auth, failure }: { auth: ScuteAuthFlow; failure: { title: string; message: string } }) {
  const preview = useInPreview();
  return (
    <div role="alert">
      <Title focus={false}>{failure.title}</Title>
      <Lead>{failure.message}</Lead>
      <Button variant="primary" autoFocus={!preview} onClick={auth.retry} className="scute-signin__mt-28">
        {auth.errorCode === APP_SETTINGS_UNAVAILABLE ? "Try again" : "Back to sign in"}
      </Button>
    </div>
  );
}

// ── Setting up a second factor while signing in (D18) ──

function MfaSetupStep({ auth }: { auth: ScuteAuthFlow }) {
  const setup = auth.mfaSetup;
  if (!setup) {
    // No setup pass (an older API): only the app's support can help.
    return (
      <FailureStep
        auth={auth}
        failure={{
          title: "Set up two-step verification first",
          message:
            "Your account needs a second step to sign in, and none is set up yet. Contact the app's support team to set one up.",
        }}
      />
    );
  }
  if (!setup.methods.length) return <FailureStep auth={auth} failure={REFUSALS.mfa_method_unavailable} />;
  if (setup.method && setup.enrollmentId) return <MfaSetupCode auth={auth} setup={setup} />;
  return <MfaSetupChoose auth={auth} setup={setup} />;
}

type MfaSetup = NonNullable<ScuteAuthFlow["mfaSetup"]>;

function MfaSetupChoose({ auth, setup }: { auth: ScuteAuthFlow; setup: MfaSetup }) {
  const preview = useInPreview();
  // A text or email code needs the address first.
  const [picked, setPicked] = useState<"sms" | "email" | null>(null);
  const error = errorText(auth.error, auth.errorCode);
  const busy = auth.submitting;

  if (picked) {
    const phone = picked === "sms";
    const submit = (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (busy) return;
      const value = String(new FormData(e.currentTarget).get("destination") ?? "").trim();
      if (value) auth.startMfaSetup(picked, value);
    };
    return (
      <form onSubmit={submit}>
        <Title focus={false}>{phone ? "Get codes by text message" : "Get codes by email"}</Title>
        <Lead>{phone ? "Enter the phone number to text your sign-in codes to." : "Enter the email to send your sign-in codes to."}</Lead>
        <label htmlFor="scute-signin-mfa-destination" className="scute-signin__label">{phone ? "Phone number" : "Email"}</label>
        <input
          id="scute-signin-mfa-destination"
          name="destination"
          type={phone ? "tel" : "email"}
          autoComplete={phone ? "tel" : "email"}
          autoFocus={!preview}
          required
          placeholder={phone ? FIELDS.phone.placeholder : FIELDS.email.placeholder}
          readOnly={busy}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? "scute-signin-mfa-destination-error" : undefined}
          className="scute-signin__input"
          data-scute-input
        />
        {error && <ErrorBox id="scute-signin-mfa-destination-error">{error}</ErrorBox>}
        <Button type="submit" variant="primary" busy={busy} className="scute-signin__mt-24">Send a code</Button>
        <TextButton onClick={() => setPicked(null)} disabled={busy}>Use another way</TextButton>
      </form>
    );
  }

  return (
    <>
      <Title focus={false}>Set up two-step verification</Title>
      <Lead>
        {setup.setupToken
          ? "Your account needs a second step to sign in. Choose how you want to get your codes."
          : "Choose how you want to get your codes."}
      </Lead>
      <div className="scute-signin__others-list scute-signin__mt-24" role="group" aria-label="Second step">
        {setup.methods.map((m) => (
          <Button
            key={m}
            align="start"
            disabled={busy}
            onClick={() => (m === "totp" ? auth.startMfaSetup("totp") : setPicked(m))}
          >
            {MFA_SETUP_LABELS[m] ?? m}
          </Button>
        ))}
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {setup.setupToken ? <Different auth={auth} /> : <TextButton onClick={auth.skipMfaEnrollment} disabled={busy}>Not now</TextButton>}
    </>
  );
}

function MfaSetupCode({ auth, setup }: { auth: ScuteAuthFlow; setup: MfaSetup }) {
  const c = useCode(6, auth.submitMfaSetupCode, auth.error);
  const method = setup.method ?? "totp";
  const label = MFA_LABELS[method] ?? method;
  const link = setup.provisioningUri?.startsWith("otpauth://") ? setup.provisioningUri : null;
  return (
    <form onSubmit={c.onSubmit}>
      <Title focus={false}>Set up two-step verification</Title>
      {method === "totp" ? (
        <>
          <Lead>Add this account to your authenticator app, then enter the 6-digit code it shows.</Lead>
          {link && (
            <p className="scute-signin__status">
              <a className="scute-signin__link" href={link}>Open in your authenticator app</a>
            </p>
          )}
          {setup.secret && (
            <p className="scute-signin__status">
              Or enter this key: <Token>{setup.secret}</Token>
            </p>
          )}
        </>
      ) : (
        <Lead>
          Enter the 6-digit code we sent to {setup.sentTo ? <Token>{setup.sentTo}</Token> : method === "sms" ? "your phone" : "your email"}.
        </Lead>
      )}
      <CodeBoxes label={label} value={c.code} disabled={c.busy} invalid={c.wrong} focusKey={c.focusKey}
                 onChange={c.onChange} describedBy={c.wrong ? "scute-signin-mfa-setup-error" : undefined} />
      {c.wrong && (
        <ErrorBox id="scute-signin-mfa-setup-error">{wrongCode(auth, "That code didn't work. Try again.")}</ErrorBox>
      )}
      <VerifyButton busy={c.busy} full={c.full} />
      <TextButton onClick={auth.restartMfaSetup} disabled={c.busy}>Use another way</TextButton>
    </form>
  );
}

// ── Confirming an email or phone while signing in (D15) ──

function ContactStep({ auth }: { auth: ScuteAuthFlow }) {
  const contact = auth.contactVerification;
  if (!contact) {
    return (
      <FailureStep
        auth={auth}
        failure={{ title: "We couldn't continue", message: "This sign-in needs a confirmed email or phone number. Start again." }}
      />
    );
  }
  return contact.challenge ? <ContactCode auth={auth} contact={contact} /> : <ContactAdd auth={auth} contact={contact} />;
}

type Contact = NonNullable<ScuteAuthFlow["contactVerification"]>;

function ContactAdd({ auth, contact }: { auth: ScuteAuthFlow; contact: Contact }) {
  const preview = useInPreview();
  const phone = contact.field === "phone";
  const error = errorText(auth.error, auth.errorCode);
  const busy = auth.submitting;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const value = String(new FormData(e.currentTarget).get("contact") ?? "").trim();
    if (value) auth.submitContact(value);
  };
  return (
    <form onSubmit={submit}>
      <Title focus={false}>{phone ? "Add your phone number" : "Add your email"}</Title>
      <Lead>
        {phone
          ? "This app needs a confirmed phone number to sign you in. Enter yours and we will text you a code."
          : "This app needs a confirmed email to sign you in. Enter yours and we will send you a code."}
      </Lead>
      <label htmlFor="scute-signin-contact" className="scute-signin__label">{phone ? "Phone number" : "Email"}</label>
      <input
        id="scute-signin-contact"
        name="contact"
        type={phone ? "tel" : "email"}
        autoComplete={phone ? "tel" : "email"}
        autoFocus={!preview}
        required
        placeholder={phone ? FIELDS.phone.placeholder : FIELDS.email.placeholder}
        readOnly={busy}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? "scute-signin-contact-error" : undefined}
        className="scute-signin__input"
        data-scute-input
      />
      {error && <ErrorBox id="scute-signin-contact-error">{error}</ErrorBox>}
      <Button type="submit" variant="primary" busy={busy} className="scute-signin__mt-24">Send a code</Button>
      <Different auth={auth} />
    </form>
  );
}

function ContactCode({ auth, contact }: { auth: ScuteAuthFlow; contact: Contact }) {
  const c = useCode(6, auth.submitContactCode, auth.error);
  const phone = contact.field === "phone";
  const [resent, setResent] = useState(false);
  const [sideError, setSideError] = useState<string | null>(null);
  const resend = async () => {
    const failure = await auth.resendContactCode();
    setSideError(failure);
    setResent(!failure);
  };
  const shownError = c.wrong
    ? wrongCode(auth, "That code didn't work. Check it and try again.")
    : sideError ? errorText(sideError, null) : null;
  return (
    <form onSubmit={c.onSubmit}>
      <Title focus={false}>{phone ? "Confirm your phone number" : "Confirm your email"}</Title>
      <Lead>
        {contact.sentTo ? (
          <>We sent a 6-digit code to <Token>{contact.sentTo}</Token>.</>
        ) : phone ? (
          "We texted a 6-digit code to the phone number on your account."
        ) : (
          "We sent a 6-digit code to the email on your account."
        )}
      </Lead>
      <CodeBoxes label="Confirmation code" value={c.code} disabled={c.busy} invalid={c.wrong} focusKey={c.focusKey}
                 onChange={c.onChange} describedBy={shownError ? "scute-signin-contact-error" : undefined} />
      {shownError && <ErrorBox id="scute-signin-contact-error">{shownError}</ErrorBox>}
      <VerifyButton busy={c.busy} full={c.full} />
      <p className="scute-signin__status" role="status">
        {resent ? "We sent a new code. " : "No code? "}
        <button type="button" className="scute-signin__text-btn scute-signin__inline-btn" onClick={resend}>
          Send {resent ? "another" : "it again"}
        </button>
      </p>
      {contact.setupToken && (
        <TextButton onClick={auth.changeContact} disabled={c.busy}>
          {phone ? "Change the number" : "Change the email"}
        </TextButton>
      )}
      <Different auth={auth} />
    </form>
  );
}
