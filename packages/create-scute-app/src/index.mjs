#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";
import { createInterface } from "readline";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

const FRAMEWORKS = {
  nextjs: { name: "Next.js", detect: ["next.config.ts", "next.config.js", "next.config.mjs"] },
  astro: { name: "Astro", detect: ["astro.config.mjs", "astro.config.ts"] },
  remix: { name: "Remix", detect: ["remix.config.js", "remix.config.ts", "vite.config.ts"] },
  tanstack: { name: "TanStack Start", detect: ["app.config.ts"] },
};

async function main() {
  console.log("\n  🔐 Scute Auth Setup\n");

  const cwd = resolve(".");
  const pkgPath = join(cwd, "package.json");

  if (!existsSync(pkgPath)) {
    console.log("  ❌ No package.json found. Run this from your project root.\n");
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

  // Detect framework
  let framework = null;
  for (const [key, fw] of Object.entries(FRAMEWORKS)) {
    if (fw.detect.some((f) => existsSync(join(cwd, f)))) {
      framework = key;
      break;
    }
  }

  if (!framework) {
    console.log("  Detected: unknown framework");
    console.log("  Supported: Next.js, Astro, Remix, TanStack Start\n");
    framework = await ask("  Framework (nextjs/astro/remix/tanstack): ");
  } else {
    console.log(`  Detected: ${FRAMEWORKS[framework].name}`);
  }

  // Get Scute credentials
  const appId = await ask("  Scute App ID: ");
  const appSecret = await ask("  Scute App Secret: ");
  const baseUrl = await ask("  API URL (press enter for https://api.scute.io): ") || "https://api.scute.io";

  console.log("\n  📦 Installing packages...\n");

  // Detect package manager
  const pm = existsSync(join(cwd, "pnpm-lock.yaml")) ? "pnpm"
    : existsSync(join(cwd, "yarn.lock")) ? "yarn"
    : existsSync(join(cwd, "bun.lockb")) ? "bun"
    : "npm";

  const installCmd = pm === "npm" ? "npm install" : `${pm} add`;

  // Install dependencies based on framework
  const deps = {
    nextjs: "@scute/js-core @scute/react-hooks @scute/nextjs-handlers @scute/auth-ui-react",
    astro: "@scute/js-core @scute/react-hooks @scute/auth-ui-react",
    remix: "@scute/js-core @scute/react-hooks @scute/auth-ui-react",
    tanstack: "@scute/js-core @scute/react-hooks @scute/auth-ui-react",
  };

  try {
    execSync(`${installCmd} ${deps[framework]}`, { cwd, stdio: "inherit" });
  } catch {
    console.log("  ⚠️  Package install failed. You may need to install manually.\n");
  }

  // Create .env.local
  console.log("\n  📝 Creating .env.local...\n");
  const envContent = [
    `NEXT_PUBLIC_SCUTE_APP_ID=${appId}`,
    `NEXT_PUBLIC_SCUTE_BASE_URL=${baseUrl}`,
    `SCUTE_SECRET=${appSecret}`,
  ].join("\n") + "\n";

  const envPath = join(cwd, ".env.local");
  if (existsSync(envPath)) {
    const existing = readFileSync(envPath, "utf-8");
    if (existing.includes("SCUTE")) {
      console.log("  ⚠️  .env.local already has Scute vars. Skipping.\n");
    } else {
      writeFileSync(envPath, existing + "\n" + envContent);
      console.log("  ✅ Appended to .env.local\n");
    }
  } else {
    writeFileSync(envPath, envContent);
    console.log("  ✅ Created .env.local\n");
  }

  // Scaffold auth files based on framework
  console.log("  📂 Scaffolding auth files...\n");

  if (framework === "nextjs") {
    scaffoldNextjs(cwd);
  } else if (framework === "astro") {
    scaffoldAstro(cwd);
  } else if (framework === "remix") {
    scaffoldRemix(cwd);
  } else if (framework === "tanstack") {
    scaffoldTanstack(cwd);
  }

  console.log("  ✅ Done! Auth is set up.\n");
  console.log("  Next steps:");
  console.log("    1. Start your dev server");
  console.log("    2. Visit your app — you'll see the login screen");
  console.log("    3. Configure auth settings at https://control.scute.io");
  console.log("");

  rl.close();
}

function scaffoldNextjs(cwd) {
  // Providers
  const providersDir = join(cwd, "src", "app");
  if (!existsSync(providersDir)) mkdirSync(providersDir, { recursive: true });

  const providersPath = join(providersDir, "scute-providers.tsx");
  writeFileSync(providersPath, `"use client";

import { useState } from "react";
import { createClientComponentClient } from "@scute/nextjs-handlers";
import { AuthContextProvider } from "@scute/react-hooks";

export function ScuteProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => createClientComponentClient());
  return (
    <AuthContextProvider scuteClient={client}>
      {children}
    </AuthContextProvider>
  );
}
`);
  console.log("  + src/app/scute-providers.tsx");

  // Auth handler
  const handlerDir = join(cwd, "src", "app", "auth", "[...scute]");
  mkdirSync(handlerDir, { recursive: true });
  writeFileSync(join(handlerDir, "route.ts"), `// @ts-nocheck
import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { ScuteHandler } from "@scute/nextjs-handlers";

const handler = async (req: NextRequest) => ScuteHandler({ cookies, headers })(req);
export { handler as GET, handler as POST };
`);
  console.log("  + src/app/auth/[...scute]/route.ts");

  // Example usage
  const examplePath = join(providersDir, "scute-auth-example.tsx");
  writeFileSync(examplePath, `"use client";

// Example: wrap your app with ScuteAuthGate for automatic auth
//
// import { ScuteAuthGate } from "@scute/auth-ui-react";
//
// <ScuteAuthGate>
//   <YourApp />
// </ScuteAuthGate>
//
// Or use the headless hook for full UI control:
//
// import { useScuteAuthFlow } from "@scute/auth-ui-react";
//
// function Login() {
//   const auth = useScuteAuthFlow();
//
//   if (auth.view === "authenticated") return <App />;
//   if (auth.view === "login") return (
//     <form onSubmit={(e) => { e.preventDefault(); auth.submitIdentifier(); }}>
//       <input value={auth.identifier} onChange={(e) => auth.setIdentifier(e.target.value)} />
//       <button type="submit">Sign in</button>
//     </form>
//   );
//   // ... handle other views
// }

export {};
`);
  console.log("  + src/app/scute-auth-example.tsx (usage examples)");

  console.log("\n  Add <ScuteProviders> to your root layout:");
  console.log('    import { ScuteProviders } from "./scute-providers";');
  console.log("    <ScuteProviders>{children}</ScuteProviders>\n");
}

function scaffoldAstro(cwd) {
  const dir = join(cwd, "src", "components");
  mkdirSync(dir, { recursive: true });

  writeFileSync(join(dir, "ScuteAuth.tsx"), `// Scute Auth for Astro (React island)
// Use this as a client-side React component in your Astro page:
//
// ---
// import ScuteAuth from "../components/ScuteAuth";
// ---
// <ScuteAuth client:only="react" />

import { ScuteAuthGate } from "@scute/auth-ui-react";
import { AuthContextProvider } from "@scute/react-hooks";
import { ScuteClient } from "@scute/js-core";
import { useState } from "react";

export default function ScuteAuth({ children }: { children?: React.ReactNode }) {
  const [client] = useState(() => new ScuteClient({
    appId: import.meta.env.PUBLIC_SCUTE_APP_ID,
    baseUrl: import.meta.env.PUBLIC_SCUTE_BASE_URL || "https://api.scute.io",
  }));

  return (
    <AuthContextProvider scuteClient={client}>
      <ScuteAuthGate>
        {children || <p>Authenticated!</p>}
      </ScuteAuthGate>
    </AuthContextProvider>
  );
}
`);
  console.log("  + src/components/ScuteAuth.tsx (Astro React island)");
}

function scaffoldRemix(cwd) {
  const dir = join(cwd, "app", "components");
  mkdirSync(dir, { recursive: true });

  writeFileSync(join(dir, "scute-auth.tsx"), `// Scute Auth for Remix
import { ScuteAuthGate, useScuteAuthFlow } from "@scute/auth-ui-react";
import { AuthContextProvider } from "@scute/react-hooks";
import { ScuteClient } from "@scute/js-core";
import { useState } from "react";

export function ScuteProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new ScuteClient({
    appId: window.ENV?.SCUTE_APP_ID || "",
    baseUrl: window.ENV?.SCUTE_BASE_URL || "https://api.scute.io",
  }));

  return (
    <AuthContextProvider scuteClient={client}>
      {children}
    </AuthContextProvider>
  );
}

export { ScuteAuthGate, useScuteAuthFlow };
`);
  console.log("  + app/components/scute-auth.tsx");
}

function scaffoldTanstack(cwd) {
  const dir = join(cwd, "app", "components");
  mkdirSync(dir, { recursive: true });

  writeFileSync(join(dir, "scute-auth.tsx"), `// Scute Auth for TanStack Start
import { ScuteAuthGate, useScuteAuthFlow } from "@scute/auth-ui-react";
import { AuthContextProvider } from "@scute/react-hooks";
import { ScuteClient } from "@scute/js-core";
import { useState } from "react";

export function ScuteProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new ScuteClient({
    appId: import.meta.env.VITE_SCUTE_APP_ID || "",
    baseUrl: import.meta.env.VITE_SCUTE_BASE_URL || "https://api.scute.io",
  }));

  return (
    <AuthContextProvider scuteClient={client}>
      {children}
    </AuthContextProvider>
  );
}

export { ScuteAuthGate, useScuteAuthFlow };
`);
  console.log("  + app/components/scute-auth.tsx");
}

main().catch(console.error);
