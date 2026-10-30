import type { ReactNode } from "react";
import type { AuthFlowView } from "../useScuteAuthFlow";

/** How the sign-in looks. Every field is optional. */
export type ScuteSignInAppearance = {
  /** Your logo above the form: an element, or an image URL. Default: none. */
  logo?: ReactNode | string;
  /** The primary button and focus color, any CSS color. Default: a near-black ink (light) or near-white (dark). */
  accentColor?: string;
  /** "light" (default), "dark", or "auto" to follow the visitor's system setting. */
  theme?: "light" | "dark" | "auto";
  /** Corner radius of fields, buttons and the card. Default "medium". */
  radius?: "none" | "small" | "medium" | "large";
  /** A CSS font-family. Default: inherited from the page. */
  fontFamily?: string;
  /**
   * Above the step: your own element (read the step with
   * useScuteSignInStep() to animate it), false for nothing. Default: a
   * small neutral icon per step.
   */
  illustration?: ReactNode | false;
  /**
   * "page" (default): a page of its own, the window's height. "fill": the
   * same page, sized to its container instead (a panel, a modal, a preview
   * frame). "card": a panel to place inside your own page.
   */
  layout?: "page" | "fill" | "card";
  /** A class on the root element. */
  className?: string;
};

/** The words on the first step. */
export type ScuteSignInCopy = {
  title?: string;
  subtitle?: string;
  emailLabel?: string;
  emailPlaceholder?: string;
  continueLabel?: string;
};

/** Links in the line under the form. It shows only when at least one is set. */
export type ScuteSignInLegal = {
  termsUrl?: string;
  privacyUrl?: string;
};

/** Sign-in methods besides email (a passkey, a link or a code, as the app is set up). */
export type ScuteSignInMethods = {
  /** "Continue with Google". The app needs Google set up in Scute. Default false. */
  google?: boolean;
};

/**
 * One step drawn with sample data, for a preview (`preview` prop). Every
 * field but `view` is optional.
 */
export type ScuteSignInPreview = {
  /** The step to draw (see AuthFlowView). */
  view: AuthFlowView;
  /**
   * The address the step shows. Default: none on the email step,
   * "you@example.com" on the others.
   */
  email?: string;
  /**
   * A failure on the step: the line under the email field, a wrong code on
   * a code step, or the reason on the "error" step.
   */
  error?: string;
  /** The API's code for `error`, like "user_banned" or "ip_blocked": its own message then. */
  errorCode?: string;
  /** On "mfa_verify": the method asked for, "totp" (default), "email_otp", "sms_otp" or "backup_code". */
  mfaMethod?: string;
  /** On "mfa_verify": the methods the visitor has, offered under "Or use another way". */
  mfaMethods?: string[];
  /** On "verification_required": where the code went, "email_otp" (default) or "sms_otp". */
  verificationMethod?: string;
  /** On "mfa_enroll_suggest": days left before a second step is required. */
  mfaGraceDaysRemaining?: number;
  /** On "mfa_verify": show "Trust this device" for this many days (the app allows device trust). */
  deviceTrustDays?: number;
};

export type ScuteSignInProps = {
  appearance?: ScuteSignInAppearance;
  copy?: ScuteSignInCopy;
  legal?: ScuteSignInLegal;
  methods?: ScuteSignInMethods;
  /**
   * The email the field starts with, like an invited address or the last
   * one used on this device. Shown until the visitor edits it; "Use a
   * different email" later starts empty.
   */
  defaultEmail?: string;
  /**
   * Draw one step with sample data instead of running the sign-in: for a
   * settings preview, docs or screenshots. Needs no Scute client or
   * AuthContextProvider, sends nothing, and moves no focus; its buttons do
   * nothing and a code is never accepted. A view name, or the view with
   * its sample data.
   */
  preview?: AuthFlowView | ScuteSignInPreview;
  /** Called once each time someone finishes signing in, with the signed-in user. */
  onSignedIn?: (user: any) => void;
};

/** What the illustration slot can follow, from useScuteSignInStep(). */
export type ScuteSignInMood = "idle" | "working" | "checking" | "locked" | "error" | "success";
