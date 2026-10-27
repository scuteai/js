import type { ReactNode } from "react";

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
  /** "page" (default): a full-height page. "card": a panel to place inside your own page. */
  layout?: "page" | "card";
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

export type ScuteSignInProps = {
  appearance?: ScuteSignInAppearance;
  copy?: ScuteSignInCopy;
  legal?: ScuteSignInLegal;
  methods?: ScuteSignInMethods;
  /** Called once each time someone finishes signing in, with the signed-in user. */
  onSignedIn?: (user: any) => void;
};

/** What the illustration slot can follow, from useScuteSignInStep(). */
export type ScuteSignInMood = "idle" | "working" | "checking" | "locked" | "error" | "success";
