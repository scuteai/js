"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { ScuteSignInMood } from "./types";

// The small parts every step is built from: a title that takes focus when
// its step opens, buttons, the code boxes and a few icons. All styled by
// the classes in styles.ts.

// ── Step context: what the illustration and the focus logic read ──

export type StepInfo = { view: string; mood: ScuteSignInMood; errorCount: number };
export const StepContext = createContext<StepInfo>({ view: "loading", mood: "idle", errorCount: 0 });

/**
 * The current sign-in step, for a custom illustration: `view` is the flow's
 * step (see AuthFlowView), `mood` a coarse state to animate on, and
 * `errorCount` goes up with each failed attempt (to shake on).
 */
export function useScuteSignInStep(): StepInfo {
  return useContext(StepContext);
}

// Set once the first step has shown, so later steps move focus to their
// title (the first one leaves focus where the page put it).
export const FocusContext = createContext<{ current: boolean }>({ current: false });

/** The step's title: focused when the step opens, unless something in it takes focus itself. */
export function Title({ children, focus = true }: { children: ReactNode; focus?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const shown = useContext(FocusContext);
  useEffect(() => {
    if (focus && shown.current) ref.current?.focus({ preventScroll: true });
    shown.current = true;
    // Once per step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <h2 ref={ref} tabIndex={-1} className="scute-signin__title">
      {children}
    </h2>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="scute-signin__lead">{children}</p>;
}

/** An address inside text. */
export function Token({ children }: { children: ReactNode }) {
  return <span className="scute-signin__token">{children}</span>;
}

export function ErrorBox({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <div role="alert" id={id} className="scute-signin__error" data-scute-error>
      {children}
    </div>
  );
}

/** A quiet line with a spinner: what the step waits for. */
export function Waiting({ children, center }: { children: ReactNode; center?: boolean }) {
  return (
    <p role="status" className="scute-signin__waiting" data-center={center || undefined}>
      <Spinner />
      {children}
    </p>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg className="scute-signin__spinner" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  variant = "secondary",
  busy,
  align,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  busy?: boolean;
  align?: "start";
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      data-variant={variant}
      data-align={align}
      data-scute-button={variant}
      className={`scute-signin__btn${className ? ` ${className}` : ""}`}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

/** A way back under the step, as underlined text. */
export function TextButton({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="scute-signin__text-btn">
      {children}
    </button>
  );
}

// ── Code boxes ──

/**
 * One box per character, for sign-in codes and MFA codes. Typing moves on,
 * Backspace on an empty box goes back, the arrows move between boxes, and
 * a pasted (or autofilled) code fills them all from the first. numeric:
 * digits only. focusKey: changing it puts the cursor back in the first box
 * (after a wrong code, or a new method).
 */
export function CodeBoxes({
  value,
  onChange,
  numeric = true,
  invalid,
  disabled,
  label,
  focusKey,
  describedBy,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  numeric?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  label: string;
  focusKey?: number;
  describedBy?: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const length = value.length;

  useEffect(() => {
    refs.current[0]?.focus();
  }, [focusKey]);

  const fill = (text: string) => {
    const chars = [...text.replace(/\s|-/g, "")].filter((c) => (numeric ? /\d/.test(c) : /[a-z0-9]/i.test(c))).slice(0, length);
    if (!chars.length) return;
    const next = [...value];
    chars.forEach((c, i) => {
      next[i] = numeric ? c : c.toUpperCase();
    });
    onChange(next);
    refs.current[Math.min(chars.length, length - 1)]?.focus();
  };

  // More than one new character at once is a paste or an autofill.
  const change = (index: number, raw: string) => {
    if (raw.length > (value[index] ? 2 : 1)) return fill(raw);
    const typed = raw.slice(-1);
    if (typed && (numeric ? !/\d/.test(typed) : !/[a-z0-9]/i.test(typed))) return;
    const next = [...value];
    next[index] = numeric ? typed : typed.toUpperCase();
    onChange(next);
    if (typed && index < length - 1) refs.current[index + 1]?.focus();
  };

  const keyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      e.preventDefault();
      const next = [...value];
      next[index - 1] = "";
      onChange(next);
      refs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < length - 1) refs.current[index + 1]?.focus();
  };

  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    fill(e.clipboardData.getData("text"));
  };

  return (
    <div role="group" aria-label={label} className="scute-signin__boxes" data-length={length}>
      {value.map((char, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={char}
          disabled={disabled}
          aria-label={`${label}, character ${i + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          type="text"
          inputMode={numeric ? "numeric" : "text"}
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoCapitalize="off"
          spellCheck={false}
          className="scute-signin__box"
          onChange={(e) => change(i, e.target.value)}
          onKeyDown={(e) => keyDown(i, e)}
          onPaste={paste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

// ── Icons: the default illustration, one per mood ──

const ICON_PATHS: Record<string, ReactNode> = {
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8m-3 3 2 2m-4 0 2 2" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10v4m0 3h.01" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
};

export function Icon({ name, size = 24 }: { name: keyof typeof ICON_PATHS | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name] ?? ICON_PATHS.user}
    </svg>
  );
}

/** The Google "G", for the Continue with Google button. */
export function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
