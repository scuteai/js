// The sign-in's stylesheet, scoped to .scute-signin. Rendered as a <style>
// element by the component itself, so it works in any React app with no
// CSS import, no Tailwind and no bundler setup, and server rendering ships
// it with the HTML (no flash of unstyled content). Colors, radius and font
// are CSS variables on the root, so `appearance` (or the page's own CSS)
// can change them.

const LIGHT = `
  --scute-bg: #f4f4f1;
  --scute-panel: #ffffff;
  --scute-line: #e0dedf;
  --scute-hover: #f8f8f7;
  --scute-ink: #000000;
  --scute-ink-strong: #2a2e3a;
  --scute-ink-muted: #666666;
  --scute-ink-soft: #6f7587;
  --scute-bad: #b42318;
  --scute-token-bg-default: #e9fd77;
  --scute-token-ink-default: #1e3a0f;
  --scute-accent-default: #2a2e3a;
  --scute-accent-ink-default: #fafaf9;
  --scute-shadow: 0 1px 2px rgba(16, 17, 20, 0.04), 0 12px 32px rgba(16, 17, 20, 0.06);
  color-scheme: light;
`;

const DARK = `
  --scute-bg: #111113;
  --scute-panel: #1b1b1f;
  --scute-line: #303139;
  --scute-hover: #24242a;
  --scute-ink: #ffffff;
  --scute-ink-strong: #ededeb;
  --scute-ink-muted: #a8a9b1;
  --scute-ink-soft: #92969f;
  --scute-bad: #ff8a80;
  --scute-token-bg-default: rgba(233, 253, 119, 0.16);
  --scute-token-ink-default: #e9fd77;
  --scute-accent-default: #ededeb;
  --scute-accent-ink-default: #16161a;
  --scute-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 12px 32px rgba(0, 0, 0, 0.3);
  color-scheme: dark;
`;

export const SIGN_IN_CSS = `
.scute-signin {
  ${LIGHT}
  --scute-r: 10px;
  --scute-accent-color: var(--scute-accent, var(--scute-accent-default));
  --scute-accent-ink-color: var(--scute-accent-ink, var(--scute-accent-ink-default));
  --scute-token-bg-color: var(--scute-token-bg, var(--scute-token-bg-default));
  --scute-token-ink-color: var(--scute-token-ink, var(--scute-token-ink-default));
  --scute-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  color: var(--scute-ink);
  font-family: var(--scute-font, inherit);
  font-size: 15px;
  line-height: 1.5;
  text-align: left;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.scute-signin[data-scute-theme="dark"] { ${DARK} }
@media (prefers-color-scheme: dark) {
  .scute-signin[data-scute-theme="auto"] { ${DARK} }
}
.scute-signin[data-scute-radius="none"] { --scute-r: 0px; }
.scute-signin[data-scute-radius="small"] { --scute-r: 6px; }
.scute-signin[data-scute-radius="medium"] { --scute-r: 10px; }
.scute-signin[data-scute-radius="large"] { --scute-r: 16px; }

/* Resets at the lowest specificity, so the classes below always win. */
.scute-signin :where(*, *::before, *::after) { box-sizing: border-box; }
.scute-signin :where(h1, h2, p) { margin: 0; }
.scute-signin :where(button, input) {
  font: inherit;
  letter-spacing: inherit;
  margin: 0;
  color: inherit;
}

/* Layouts: a page of its own, or a card inside the app's page. */
.scute-signin[data-scute-layout="page"] {
  min-height: 100vh;
  min-height: 100dvh;
  padding: 40px 16px 24px;
  background: var(--scute-bg);
}
.scute-signin[data-scute-layout="card"] {
  max-width: 456px;
  margin: 0 auto;
  padding: 32px 24px 24px;
  background: var(--scute-panel);
  border: 1px solid var(--scute-line);
  border-radius: calc(var(--scute-r) + 6px);
  box-shadow: var(--scute-shadow);
}
@media (min-width: 640px) {
  .scute-signin[data-scute-layout="page"] { padding: 48px 24px 24px; }
  .scute-signin[data-scute-layout="card"] { padding: 40px 32px 28px; }
}

.scute-signin__logo {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-height: 24px;
  color: var(--scute-ink-strong);
}
.scute-signin__logo img { display: block; max-height: 32px; max-width: 200px; width: auto; height: auto; }

.scute-signin__illustration {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 24px;
}
.scute-signin__logo + .scute-signin__illustration { margin-top: 24px; }
.scute-signin__icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: calc(var(--scute-r) + 4px);
  background: var(--scute-panel);
  border: 1px solid var(--scute-line);
  color: var(--scute-ink-soft);
}
.scute-signin[data-scute-layout="card"] .scute-signin__icon { background: var(--scute-bg); }
.scute-signin__icon[data-mood="error"] { color: var(--scute-bad); }
.scute-signin__icon[data-mood="success"] { color: var(--scute-ink-strong); }

.scute-signin__main {
  width: 100%;
  max-width: 400px;
  margin-top: 16px;
}
.scute-signin__logo + .scute-signin__main { margin-top: 32px; }
@media (min-width: 640px) {
  .scute-signin__illustration { margin-top: 32px; }
  .scute-signin__main { margin-top: 24px; }
}
@media (prefers-reduced-motion: no-preference) {
  .scute-signin__step { animation: scute-rise 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
  .scute-signin__spinner { animation: scute-spin 0.8s linear infinite; }
}
@keyframes scute-rise { from { opacity: 0; transform: translateY(8px) scale(0.98); } }
@keyframes scute-spin { to { transform: rotate(360deg); } }

.scute-signin__title {
  font-size: 28px;
  line-height: 34px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--scute-ink-strong);
  outline: none;
}
.scute-signin__lead {
  margin-top: 8px;
  font-size: 15px;
  line-height: 22px;
  color: var(--scute-ink-muted);
}
.scute-signin__label {
  display: block;
  margin-top: 28px;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  color: var(--scute-ink-strong);
}
.scute-signin__input {
  display: block;
  width: 100%;
  height: 48px;
  margin-top: 8px;
  padding: 0 14px;
  border: 1px solid var(--scute-line);
  border-radius: var(--scute-r);
  background: var(--scute-panel);
  color: var(--scute-ink-strong);
  font-size: 16px;
  outline: none;
  transition: border-color 120ms, box-shadow 120ms;
}
.scute-signin__input::placeholder { color: var(--scute-ink-soft); opacity: 1; }
.scute-signin__input:focus, .scute-signin__box:focus {
  border-color: var(--scute-ink-soft);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--scute-accent-color) 16%, transparent);
}
.scute-signin__input[aria-invalid="true"], .scute-signin__box[aria-invalid="true"] { border-color: var(--scute-bad); }

.scute-signin__error {
  margin-top: 20px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--scute-bad) 22%, transparent);
  border-radius: var(--scute-r);
  background: color-mix(in srgb, var(--scute-bad) 6%, transparent);
  color: var(--scute-bad);
  font-size: 14px;
  line-height: 20px;
}

.scute-signin__btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 48px;
  padding: 0 20px;
  border-radius: var(--scute-r);
  font-size: 15px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 150ms, color 150ms, filter 150ms, transform 120ms;
}
.scute-signin__btn:focus-visible, .scute-signin__link:focus-visible, .scute-signin__text-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--scute-accent-color) 55%, transparent);
  outline-offset: 2px;
}
.scute-signin__btn:active:not(:disabled) { transform: scale(0.98); }
.scute-signin__btn[data-variant="primary"] {
  border: 0;
  background: var(--scute-accent-color);
  color: var(--scute-accent-ink-color);
}
@media (hover: hover) {
  .scute-signin__btn[data-variant="primary"]:hover:not(:disabled) { filter: brightness(1.12) saturate(1.05); }
  .scute-signin[data-scute-theme="dark"] .scute-signin__btn[data-variant="primary"]:hover:not(:disabled) { filter: brightness(0.92); }
  .scute-signin__btn[data-variant="secondary"]:hover:not(:disabled) { background: var(--scute-hover); }
}
.scute-signin__btn[data-variant="primary"]:disabled {
  background: color-mix(in srgb, var(--scute-ink-strong) 9%, var(--scute-panel));
  color: color-mix(in srgb, var(--scute-ink-strong) 55%, transparent);
  cursor: default;
}
.scute-signin__btn[data-variant="primary"][aria-busy="true"] {
  background: var(--scute-accent-color);
  color: var(--scute-accent-ink-color);
}
.scute-signin__btn[data-variant="secondary"] {
  border: 1px solid var(--scute-line);
  background: var(--scute-panel);
  color: var(--scute-ink-strong);
}
.scute-signin__btn[data-variant="secondary"]:disabled { color: var(--scute-ink-soft); cursor: default; }
.scute-signin__btn[data-align="start"] { justify-content: flex-start; }
.scute-signin__btn svg { flex-shrink: 0; }

.scute-signin__mt-12 { margin-top: 12px; }
.scute-signin__mt-24 { margin-top: 24px; }
.scute-signin__mt-28 { margin-top: 28px; }

.scute-signin__or {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
  font-family: var(--scute-mono);
  font-size: 12px;
  line-height: 16px;
  text-transform: uppercase;
  color: var(--scute-ink-soft);
}
.scute-signin__or::before, .scute-signin__or::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--scute-line);
}

.scute-signin__text-btn {
  display: block;
  margin: 20px auto 0;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  font-size: 14px;
  line-height: 20px;
  color: var(--scute-ink-soft);
  text-decoration: underline;
  text-underline-offset: 4px;
  cursor: pointer;
}
.scute-signin__text-btn:hover { color: var(--scute-ink); }
.scute-signin__text-btn:disabled { opacity: 0.5; cursor: default; }
.scute-signin__inline-btn { display: inline; margin: 0; }

.scute-signin__waiting {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 28px;
  font-size: 14px;
  line-height: 20px;
  color: var(--scute-ink-soft);
}
.scute-signin__waiting[data-center] { justify-content: center; margin-top: 8px; }
.scute-signin__status {
  min-height: 20px;
  margin-top: 12px;
  font-size: 14px;
  line-height: 20px;
  text-align: center;
  color: var(--scute-ink-soft);
}

.scute-signin__token {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--scute-token-bg-color);
  color: var(--scute-token-ink-color);
  font-family: var(--scute-mono);
  font-size: 0.875em;
  overflow-wrap: anywhere;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}

.scute-signin__boxes { display: flex; gap: 8px; margin-top: 28px; }
.scute-signin__box {
  flex: 1;
  width: 0;
  min-width: 0;
  height: 56px;
  padding: 0;
  border: 1px solid var(--scute-line);
  border-radius: var(--scute-r);
  background: var(--scute-panel);
  color: var(--scute-ink-strong);
  font-family: var(--scute-mono);
  font-size: 22px;
  text-align: center;
  outline: none;
  transition: border-color 120ms, box-shadow 120ms;
}
.scute-signin__boxes[data-length="8"] { gap: 6px; }
.scute-signin__boxes[data-length="8"] .scute-signin__box { height: 52px; font-size: 20px; }
.scute-signin__box:disabled { color: var(--scute-ink-soft); }

.scute-signin__others {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--scute-line);
}
.scute-signin__others-label { font-size: 13px; line-height: 20px; color: var(--scute-ink-soft); }
.scute-signin__others-list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }

.scute-signin__legal {
  margin-top: auto;
  padding-top: 48px;
  font-size: 13px;
  line-height: 20px;
  text-align: center;
  color: var(--scute-ink-soft);
}
.scute-signin[data-scute-layout="card"] .scute-signin__legal { padding-top: 28px; }
.scute-signin__link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 4px;
  border-radius: 2px;
}
.scute-signin__link:hover { color: var(--scute-ink); }

.scute-signin__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`;
