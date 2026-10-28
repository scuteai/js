// How to add Scute sign-in to an app, by framework. The one source for the
// files create-scute-app writes and the snippets the Scute dashboard shows.
// Plain data and string building, no Node or React imports, so a browser
// bundle can take it as is (`create-scute-app/recipes`).
//
// Each recipe lists its packages, its env line and its files by path; `code`
// is those files as one snippet.

// Each package's README on GitHub.
export const DOCS = "https://github.com/scuteai/js/tree/main/packages";
// The SDK reads env itself only in @scute/nextjs-handlers
// (NEXT_PUBLIC_SCUTE_APP_ID). Elsewhere the code passes the app ID in, and
// the env name is the framework's convention for values the browser sees.
export const PASSED_IN = "The SDK doesn't read it itself: the code passes it to createClient.";

const JS_GUIDE = "https://docs.scute.io/quickstarts/javascript";
const GATE = "ScuteAuthGate shows sign-in until the person is in.";

// What ScuteSignIn (@scute/auth-ui-react) uses for a prop that isn't passed.
// Code is written with only the values that differ from these.
export const SIGN_IN_DEFAULTS = {
  appearance: { theme: "light", radius: "medium", layout: "page" },
  copy: {
    title: "Sign in",
    subtitle: "Enter your email and we will send you a link or a code. No account yet? This makes one.",
    emailLabel: "Email", emailPlaceholder: "name@company.com", continueLabel: "Continue",
  },
  methods: { google: false },
};
// The package's own button color in light, for the plain JavaScript form.
export const PACKAGE_INK = "#2a2e3a";

const GROUPS = ["appearance", "copy", "legal", "methods"];
const DEFAULTS = { appearance: SIGN_IN_DEFAULTS.appearance, copy: SIGN_IN_DEFAULTS.copy, legal: {}, methods: SIGN_IN_DEFAULTS.methods };

// Each group's set values that aren't the default, in the props' order.
export function changedProps(s) {
  const out = {};
  for (const group of GROUPS) {
    const kept = Object.entries(s?.[group] ?? {}).filter(([k, v]) => {
      if (v === undefined || v === "") return false;
      const d = DEFAULTS[group][k];
      return typeof v === "string" ? v.trim() !== d : v !== d;
    }).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]);
    if (kept.length) out[group] = Object.fromEntries(kept);
  }
  return out;
}

const literal = (v) => (typeof v === "string" ? JSON.stringify(v) : String(v));
const object = (o) => `{{ ${Object.entries(o).map(([k, v]) => `${k}: ${literal(v)}`).join(", ")} }}`;

// The component with its props, `indent` spaces in, around `children` (or
// self-closing without). Props one per line; none, all on one line.
export function jsxOf(component, s, indent = 0, children) {
  const pad = " ".repeat(indent);
  const props = Object.entries(s ? changedProps(s) : {}).map(([k, v]) => `${pad}  ${k}=${object(v)}`);
  if (!props.length) return children === undefined ? `${pad}<${component} />` : `${pad}<${component}>${children}</${component}>`;
  const open = `${pad}<${component}\n${props.join("\n")}\n${pad}`;
  return children === undefined ? `${open}/>` : `${open}>\n${pad}  ${children}\n${pad}</${component}>`;
}
const gate = (s, indent, children) => jsxOf("ScuteAuthGate", s, indent, children);

function recipe(r) {
  const one = r.files.length === 1 ? r.files[0] : undefined;
  return {
    ...r,
    filename: one?.path,
    code: one ? one.code : r.files.map((f) => `// ${f.path}\n${f.code}`).join("\n\n"),
    install: `npm install ${r.packages.join(" ")}`,
  };
}

const REACT_PACKAGES = ["@scute/react-hooks", "@scute/auth-ui-react"];

// A client component: the Scute client, its context, and the sign-in gate
// around the children. `appId` is the expression that reads the app ID.
const providers = (appId, signIn, doc = "") => `import { useState, type ReactNode } from "react";
import { AuthContextProvider, createClient } from "@scute/react-hooks";
import { ScuteAuthGate } from "@scute/auth-ui-react";
${doc}
export function ScuteProviders({ children }: { children: ReactNode }) {
  const [scute] = useState(() => createClient({ appId: ${appId} }));

  return (
    <AuthContextProvider scuteClient={scute}>
${gate(signIn, 6, "{children}")}
    </AuthContextProvider>
  );
}`;

function nextjs(appId, signIn) {
  return recipe({
    id: "nextjs", label: "Next.js", language: "tsx",
    packages: ["@scute/nextjs-handlers", "@scute/react-hooks", "@scute/auth-ui-react"],
    envFile: ".env.local", env: `NEXT_PUBLIC_SCUTE_APP_ID=${appId}`,
    files: [
      { path: "src/app/auth/[...scute]/route.ts", code: `import { cookies, headers } from "next/headers";
import { ScuteHandler } from "@scute/nextjs-handlers";

const handler = ScuteHandler({ cookies, headers });

export { handler as GET, handler as POST };` },
      { path: "src/app/scute-providers.tsx", code: `"use client";
import { useState } from "react";
import { createClientComponentClient } from "@scute/nextjs-handlers";
import { AuthContextProvider } from "@scute/react-hooks";
import { ScuteAuthGate } from "@scute/auth-ui-react";

export function ScuteProviders({ children }: { children: React.ReactNode }) {
  // Reads NEXT_PUBLIC_SCUTE_APP_ID itself.
  const [client] = useState(() => createClientComponentClient());

  return (
    <AuthContextProvider scuteClient={client}>
${gate(signIn, 6, "{children}")}
    </AuthContextProvider>
  );
}` },
    ],
    then: `Wrap the root layout's children in ScuteProviders. ${GATE}`,
    docs: `${DOCS}/auth/nextjs`,
  });
}

function react(appId, signIn) {
  return recipe({
    id: "react", label: "React", language: "tsx",
    packages: REACT_PACKAGES,
    envFile: ".env", env: `VITE_SCUTE_APP_ID=${appId}`, envNote: PASSED_IN,
    files: [{ path: "src/scute-providers.tsx", code: providers("import.meta.env.VITE_SCUTE_APP_ID", signIn) }],
    then: `Wrap your app in ScuteProviders where it renders (src/main.tsx). ${GATE}`,
    docs: `${DOCS}/auth/react`,
  });
}

const attr = (v) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const text = (v) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

// js-core has no UI: the form is yours, with the words and color picked.
function javascript(appId, s) {
  const changed = changedProps(s);
  const c = { ...SIGN_IN_DEFAULTS.copy, ...changed.copy };
  const accent = changed.appearance?.accentColor ?? PACKAGE_INK;
  const google = s?.methods?.google ?? SIGN_IN_DEFAULTS.methods.google;
  return recipe({
    id: "javascript", label: "JavaScript", language: "js",
    packages: ["@scute/js-core"],
    envFile: ".env", env: `VITE_SCUTE_APP_ID=${appId}`, envNote: PASSED_IN,
    files: [{ path: "src/sign-in.js", code: `import { createClient } from "@scute/js-core";

const scute = createClient({ appId: import.meta.env.VITE_SCUTE_APP_ID });

// Back from the email link: finish signing in.
const token = scute.getMagicLinkToken();
if (token) {
  const { data } = await scute.verifyMagicLinkToken(token);
  if (data?.authPayload) await scute.signInWithTokenPayload(data.authPayload);
}

// js-core has no UI: this form is yours to style. --accent is your color.
const root = document.querySelector("#sign-in");
root.innerHTML = \`
  <form style="--accent: ${accent}">
    <h1>${text(c.title)}</h1>
    <p>${text(c.subtitle)}</p>
    <label>${text(c.emailLabel)} <input name="email" type="email" placeholder="${attr(c.emailPlaceholder)}" required /></label>
    <button type="submit">${text(c.continueLabel)}</button>${google ? `
    <button type="button" data-google>Continue with Google</button>` : ""}
  </form>\`;

root.querySelector("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = new FormData(e.currentTarget).get("email");
  // A passkey, or an email link or code, as the app is set up.
  const { data, error } = await scute.signInOrUp(email);
  if (error) return alert(error.message);
  if (data) root.textContent = "Check your email to finish signing in.";
});${google ? `
root.querySelector("[data-google]").addEventListener("click", () => scute.signInWithOAuthProvider("google"));` : ""}` }],
    then: "Import src/sign-in.js in the page and give it an element with id sign-in. Theme, corners, layout and illustration are ScuteSignIn props; here they're your CSS.",
    docs: JS_GUIDE,
  });
}

function node(appId) {
  return recipe({
    id: "node", label: "Node", language: "js",
    packages: ["@scute/js-core"],
    envFile: ".env", env: `SCUTE_APP_ID=${appId}`, envNote: PASSED_IN,
    files: [{ path: "scute-auth.js", code: `import { createClient } from "@scute/js-core";

export const scute = createClient({ appId: process.env.SCUTE_APP_ID });

// The signed-in person for a request, or null. The browser sends the
// session's access token as a bearer token.
export async function currentUser(req) {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (!token) return null;
  const { data, error } = await scute.getUser(token);
  return error ? null : data.user;
}` }],
    then: "Call currentUser(req) in any route (Express, Fastify, node:http): null means signed out. Admin calls (users, sessions) take secretKey as well: keep SCUTE_SECRET on the server only.",
    docs: `${DOCS}/auth/core`,
  });
}

function astro(appId, signIn) {
  return recipe({
    id: "astro", label: "Astro", language: "tsx",
    packages: REACT_PACKAGES,
    envFile: ".env", env: `PUBLIC_SCUTE_APP_ID=${appId}`, envNote: PASSED_IN,
    files: [{ path: "src/components/ScuteAuth.tsx", code: `import type { ReactNode } from "react";
import { AuthContextProvider, createClient } from "@scute/react-hooks";
import { ScuteAuthGate } from "@scute/auth-ui-react";

const scute = createClient({ appId: import.meta.env.PUBLIC_SCUTE_APP_ID });

// A React island. In a page: <ScuteAuth client:only="react">...</ScuteAuth>
export default function ScuteAuth({ children }: { children?: ReactNode }) {
  return (
    <AuthContextProvider scuteClient={scute}>
${gate(signIn, 6, "{children}")}
    </AuthContextProvider>
  );
}` }],
    then: `Needs Astro's React integration (npx astro add react). Put the pages that need sign-in inside <ScuteAuth client:only="react">. ${GATE}`,
    docs: `${DOCS}/auth-ui/react`,
  });
}

function remix(appId, signIn) {
  return recipe({
    id: "remix", label: "Remix", language: "tsx",
    packages: REACT_PACKAGES,
    envFile: ".env", env: `VITE_SCUTE_APP_ID=${appId}`, envNote: PASSED_IN,
    files: [{ path: "app/scute-providers.tsx", code: providers("import.meta.env.VITE_SCUTE_APP_ID", signIn) }],
    then: `Wrap <Outlet /> in app/root.tsx in ScuteProviders. ${GATE}`,
    docs: `${DOCS}/auth-ui/react`,
  });
}

function tanstack(appId, signIn) {
  return recipe({
    id: "tanstack", label: "TanStack Start", language: "tsx",
    packages: REACT_PACKAGES,
    envFile: ".env", env: `VITE_SCUTE_APP_ID=${appId}`, envNote: PASSED_IN,
    files: [{ path: "src/scute-providers.tsx", code: providers("import.meta.env.VITE_SCUTE_APP_ID", signIn) }],
    then: `Wrap the root route's children (src/routes/__root.tsx) in ScuteProviders. ${GATE}`,
    docs: `${DOCS}/auth-ui/react`,
  });
}

const BUILD = { nextjs, react, javascript, node, astro, remix, tanstack };

// Every framework, in the order they're offered.
export const FRAMEWORKS = [
  { id: "nextjs", label: "Next.js" }, { id: "react", label: "React" },
  { id: "javascript", label: "JavaScript" }, { id: "node", label: "Node" },
  { id: "astro", label: "Astro" }, { id: "remix", label: "Remix" },
  { id: "tanstack", label: "TanStack Start" },
];

// One framework's recipe. signIn: the sign-in's props (appearance, copy,
// legal, methods); only values that differ from the defaults are written.
export function sdkRecipe(id, appId, signIn) {
  const build = BUILD[id];
  if (!build) throw new Error(`Unknown framework "${id}". One of: ${Object.keys(BUILD).join(", ")}`);
  return build(appId, signIn);
}

// Every framework's recipe, in FRAMEWORKS' order.
export const sdkRecipes = (appId, signIn) => FRAMEWORKS.map((f) => sdkRecipe(f.id, appId, signIn));
