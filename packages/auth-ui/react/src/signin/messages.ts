// What went wrong, in words people can act on. The flow keeps the SDK's
// message and the API's error code; these turn them into a title and a
// message for the screen.

export type Failure = { title: string; message: string };

const GENERIC = "Something went wrong on our side. Try again in a moment.";

/** Refusals and other sign-in errors the API names with a code. */
export const REFUSALS: Record<string, Failure> = {
  user_banned: {
    title: "This account can't sign in",
    message: "This account has been banned from this app. If you think this is a mistake, contact the app's support team.",
  },
  user_suspended: {
    title: "This account is suspended",
    message: "This account is suspended for now, so it can't sign in. Contact the app's support team to find out more.",
  },
  ip_blocked: {
    title: "Sign-ins from your network are blocked",
    message: "This app doesn't allow sign-ins from the network you're on. Try another connection, or contact the app's support team.",
  },
  country_blocked: {
    title: "Sign-ins from your country are blocked",
    message: "This app doesn't allow sign-ins from the country you're in. Contact the app's support team if you need access.",
  },
  security_block: {
    title: "We stopped this sign-in",
    message: "It didn't look safe, so we blocked it. If it was you, try again from a device you've used before, or contact the app's support team.",
  },
  account_deactivated: {
    title: "This account was deactivated",
    message: "It can't sign in anymore. Contact the app's support team if you think this is a mistake.",
  },
  mfa_required: {
    title: "Finish on the other device",
    message: "This account asks for a second step. Finish signing in on the device where you opened the link.",
  },
  verification_unavailable: {
    title: "We couldn't send your code",
    message: "This sign-in needs a code to confirm it's you, and we couldn't send one. Start again from your email.",
  },
  app_settings_unavailable: {
    title: "Sign-in isn't available right now",
    message: "We couldn't load this app's sign-in settings. Check your connection and try again.",
  },
  ERROR_PASSKEYS_UNAVAILABLE: {
    title: "Passkeys aren't available here",
    message: "This page can't use passkeys. They need a secure connection (https) and a browser that supports them.",
  },
};

/** One line for under a form: the refusal's message, else the SDK's, else a generic one. */
export function errorText(error: string | null, code: string | null): string | null {
  if (!error && !code) return null;
  if (code && REFUSALS[code]) return REFUSALS[code].message;
  if (!error || error === "Something went wrong." || /^(Internal Server Error|Failed to fetch)$/i.test(error)) return GENERIC;
  return error;
}

/** A title and message for the error step. */
export function failureFor(error: string | null, code: string | null): Failure {
  if (code && REFUSALS[code]) return REFUSALS[code];
  if (code === "magic_link_not_found_or_expired" || /not found or expired|expired/i.test(error ?? "")) {
    return { title: "This link has expired", message: "Sign-in links work once and only for a short while. Ask for a new one." };
  }
  if (/timed out/i.test(error ?? "")) {
    return { title: "The sign-in link timed out", message: "We stopped waiting for the link. Start again and we will send a new one." };
  }
  return { title: "We couldn't sign you in", message: errorText(error, code) ?? GENERIC };
}

/** MFA method names, for both the challenge ("email_otp") and enrollment ("email") spellings. */
export const MFA_LABELS: Record<string, string> = {
  totp: "Authenticator app",
  email_otp: "Email code",
  email: "Email code",
  sms_otp: "Text message code",
  sms: "Text message code",
  backup_code: "Backup code",
  backup_codes: "Backup code",
  webauthn: "Passkey",
};

export const MFA_LEADS: Record<string, string> = {
  totp: "Enter the 6-digit code from your authenticator app.",
  email_otp: "Enter the 6-digit code we just emailed you.",
  sms_otp: "Enter the 6-digit code we just texted you.",
  backup_code: "Enter one of your 8-character backup codes. Each one works once.",
};

// Methods a sign-in can switch to without the app's key (TOTP, a text or
// email code, a backup code), in the challenge's spelling.
const SWITCHABLE: Record<string, string> = {
  totp: "totp",
  sms: "sms_otp",
  sms_otp: "sms_otp",
  email: "email_otp",
  email_otp: "email_otp",
  backup_codes: "backup_code",
  backup_code: "backup_code",
};

/** The challenge spelling of a method, or null if a sign-in can't switch to it. */
export const switchableMethod = (method: string): string | null => SWITCHABLE[method] ?? null;

export const isBackupCode = (method: string) => method === "backup_code" || method === "backup_codes";
