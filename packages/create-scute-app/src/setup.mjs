// The CLI's decisions, kept apart from its prompts so they can be tested:
// which framework, which package manager, where each file goes, and the env
// file with the recipe's line in it.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

// Most specific first: Next.js, Astro, Remix and TanStack Start apps also
// depend on react, and most front ends on vite.
const BY_DEPENDENCY = [
  ["nextjs", ["next"]],
  ["astro", ["astro"]],
  ["remix", ["@remix-run/react", "@remix-run/dev", "@react-router/dev"]],
  ["tanstack", ["@tanstack/react-start", "@tanstack/start"]],
  ["react", ["react"]],
  ["javascript", ["vite"]],
];
const BY_FILE = [
  ["nextjs", ["next.config.ts", "next.config.js", "next.config.mjs"]],
  ["astro", ["astro.config.mjs", "astro.config.ts"]],
  ["remix", ["remix.config.js", "remix.config.ts", "react-router.config.ts"]],
];

/** The framework a project uses, from its package.json and config files, or null. */
export function detectFramework(cwd, pkg) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [id, names] of BY_DEPENDENCY) if (names.some((n) => n in deps)) return id;
  for (const [id, files] of BY_FILE) if (files.some((f) => existsSync(join(cwd, f)))) return id;
  return null;
}

/** The project's package manager: package.json's packageManager, else its lockfile, else npm. */
export function packageManager(cwd, pkg) {
  const declared = typeof pkg.packageManager === "string" ? pkg.packageManager.split("@")[0] : "";
  if (["npm", "pnpm", "yarn", "bun"].includes(declared)) return declared;
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) return "bun";
  return "npm";
}

/** The command and arguments that add `packages` with `pm`. */
export const installCommand = (pm, packages) => [pm, [pm === "npm" ? "install" : "add", ...packages]];

const isDir = (p) => existsSync(p) && statSync(p).isDirectory();

/** Where a recipe file goes: recipes use src/; a project without src/ (a Next.js app/ at the root) drops it. */
export function targetPath(cwd, path) {
  return path.startsWith("src/") && !isDir(join(cwd, "src")) ? path.slice(4) : path;
}

/**
 * The env file's text with the recipe's line added, or null when the
 * variable is already set there (it's left as is).
 */
export function withEnvLine(existing, line) {
  const name = line.slice(0, line.indexOf("=") + 1);
  if (existing.split(/\r?\n/).some((l) => l.trimStart().startsWith(name))) return null;
  if (!existing) return `${line}\n`;
  return `${existing}${existing.endsWith("\n") ? "" : "\n"}${line}\n`;
}
