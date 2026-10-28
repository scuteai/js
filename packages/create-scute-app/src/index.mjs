#!/usr/bin/env node
// npx create-scute-app: add Scute sign-in to the project in this folder.
// Installs the recipe's packages with the project's package manager, adds
// its env line and writes its files (recipes.mjs, the same recipes the Scute
// dashboard shows). Existing files and env values are never overwritten.
//
//   npx create-scute-app [--framework <id>] [--app-id <id>] [--no-install]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { FRAMEWORKS, sdkRecipe } from "./recipes.mjs";
import { detectFramework, installCommand, packageManager, targetPath, withEnvLine } from "./setup.mjs";

const IDS = FRAMEWORKS.map((f) => f.id);

function flags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const [key, inline] = argv[i].split("=", 2);
    if (key === "--help" || key === "-h") out.help = true;
    else if (key === "--no-install") out.noInstall = true;
    else if (key === "--framework" || key === "--app-id") out[key.slice(2)] = inline ?? argv[++i];
  }
  return out;
}

let rl;
const ask = (q) => {
  rl ??= createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(q, (a) => r(a.trim())));
};

async function main() {
  const opts = flags(process.argv.slice(2));
  if (opts.help) {
    console.log(`\n  npx create-scute-app [--framework <${IDS.join("|")}>] [--app-id <id>] [--no-install]\n`);
    return;
  }
  console.log("\n  Scute sign-in setup\n");

  const cwd = resolve(".");
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    console.log("  No package.json here. Run this from your project's root.\n");
    process.exitCode = 1;
    return;
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

  let framework = opts.framework ?? detectFramework(cwd, pkg);
  if (opts.framework) console.log(`  Framework: ${opts.framework}`);
  else if (framework) console.log(`  Detected: ${FRAMEWORKS.find((f) => f.id === framework).label}`);
  while (!IDS.includes(framework)) {
    if (framework) console.log(`  "${framework}" isn't one of them.`);
    framework = await ask(`  Framework (${IDS.join(", ")}): `);
  }

  let appId = opts["app-id"] ?? "";
  while (!appId) appId = await ask("  Scute app ID (on the app's page in the dashboard): ");
  rl?.close();

  const recipe = sdkRecipe(framework, appId);

  const pm = packageManager(cwd, pkg);
  const [cmd, args] = installCommand(pm, recipe.packages);
  if (opts.noInstall) console.log(`\n  Not installing. Run: ${cmd} ${args.join(" ")}`);
  else {
    console.log(`\n  ${cmd} ${args.join(" ")}\n`);
    const installed = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    if (installed.status !== 0) console.log(`\n  The install didn't finish. Run it yourself: ${cmd} ${args.join(" ")}`);
  }

  const envPath = join(cwd, recipe.envFile);
  const env = withEnvLine(existsSync(envPath) ? readFileSync(envPath, "utf-8") : "", recipe.env);
  if (env === null) console.log(`\n  ${recipe.envFile} already sets ${recipe.env.split("=")[0]}; left as is.`);
  else {
    writeFileSync(envPath, env);
    console.log(`\n  ${recipe.envFile}: ${recipe.env}`);
  }

  const skipped = [];
  for (const file of recipe.files) {
    const path = targetPath(cwd, file.path);
    const full = join(cwd, path);
    if (existsSync(full)) {
      skipped.push({ path, code: file.code });
      continue;
    }
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, `${file.code}\n`);
    console.log(`  + ${path}`);
  }
  for (const s of skipped) console.log(`\n  ${s.path} already exists; left as is. Scute's version:\n\n${s.code}\n`);

  console.log("\n  Next:");
  if (recipe.then) console.log(`    ${recipe.then}`);
  console.log(`    Docs: ${recipe.docs}`);
  console.log("    Sign-in methods, MFA and branding are on the app's pages at https://control.scute.io\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
