import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sdkRecipe } from "../src/recipes.mjs";
import { detectFramework, installCommand, packageManager, targetPath, withEnvLine } from "../src/setup.mjs";

const CLI = fileURLToPath(new URL("../src/index.mjs", import.meta.url));

function project(pkg, files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "create-scute-app-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

test("detects the framework from dependencies, most specific first", () => {
  const cases = [
    [{ dependencies: { next: "15", react: "19" } }, "nextjs"],
    [{ dependencies: { astro: "5", react: "19" } }, "astro"],
    [{ dependencies: { "@remix-run/react": "2", react: "18" }, devDependencies: { vite: "5" } }, "remix"],
    [{ dependencies: { "@tanstack/react-start": "1", react: "19" } }, "tanstack"],
    [{ dependencies: { react: "19" }, devDependencies: { vite: "6" } }, "react"],
    [{ devDependencies: { vite: "6" } }, "javascript"],
    [{ dependencies: { express: "5" } }, null],
  ];
  for (const [pkg, want] of cases) assert.equal(detectFramework(project(pkg), pkg), want);
  assert.equal(detectFramework(project({}, { "next.config.mjs": "" }), {}), "nextjs");
});

test("uses the project's package manager", () => {
  assert.equal(packageManager(project({}), {}), "npm");
  assert.equal(packageManager(project({}, { "pnpm-lock.yaml": "" }), {}), "pnpm");
  assert.equal(packageManager(project({}, { "yarn.lock": "" }), {}), "yarn");
  assert.equal(packageManager(project({}, { "bun.lock": "" }), {}), "bun");
  assert.equal(packageManager(project({}, { "yarn.lock": "" }), { packageManager: "pnpm@9.0.0" }), "pnpm");
  assert.deepEqual(installCommand("npm", ["a", "b"]), ["npm", ["install", "a", "b"]]);
  assert.deepEqual(installCommand("pnpm", ["a"]), ["pnpm", ["add", "a"]]);
});

test("drops src/ for a project without one", () => {
  assert.equal(targetPath(project({}), "src/app/scute-providers.tsx"), "app/scute-providers.tsx");
  assert.equal(targetPath(project({}, { "src/index.ts": "" }), "src/app/scute-providers.tsx"), "src/app/scute-providers.tsx");
  assert.equal(targetPath(project({}), "app/scute-providers.tsx"), "app/scute-providers.tsx");
});

test("adds the env line once, keeping what's there", () => {
  assert.equal(withEnvLine("", "A=1"), "A=1\n");
  assert.equal(withEnvLine("B=2", "A=1"), "B=2\nA=1\n");
  assert.equal(withEnvLine("B=2\n", "A=1"), "B=2\nA=1\n");
  assert.equal(withEnvLine("A=old\n", "A=1"), null);
  assert.equal(withEnvLine("AB=2\n", "A=1"), "AB=2\nA=1\n");
});

test("writes the recipe's files and env line, and never overwrites", () => {
  const dir = project({ dependencies: { next: "15", react: "19" } }, { "src/app/page.tsx": "", ".env.local": "OTHER=1\n" });
  const run = () => spawnSync(process.execPath, [CLI, "--app-id", "app_1", "--no-install"], { cwd: dir, encoding: "utf-8" });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const recipe = sdkRecipe("nextjs", "app_1");
  for (const f of recipe.files) assert.equal(readFileSync(join(dir, f.path), "utf-8"), `${f.code}\n`);
  assert.equal(readFileSync(join(dir, ".env.local"), "utf-8"), "OTHER=1\nNEXT_PUBLIC_SCUTE_APP_ID=app_1\n");
  assert.match(first.stdout, /npm install @scute\/nextjs-handlers/);

  writeFileSync(join(dir, "src/app/scute-providers.tsx"), "mine");
  const second = spawnSync(process.execPath, [CLI, "--app-id", "app_2", "--no-install"], { cwd: dir, encoding: "utf-8" });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(readFileSync(join(dir, "src/app/scute-providers.tsx"), "utf-8"), "mine");
  assert.equal(readFileSync(join(dir, ".env.local"), "utf-8"), "OTHER=1\nNEXT_PUBLIC_SCUTE_APP_ID=app_1\n");
  assert.match(second.stdout, /already exists; left as is/);
});

test("--framework picks a recipe without detection", () => {
  const dir = project({ dependencies: { express: "5" } });
  const r = spawnSync(process.execPath, [CLI, "--framework", "node", "--app-id=app_1", "--no-install"], { cwd: dir, encoding: "utf-8" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(dir, "scute-auth.js")));
  assert.equal(readFileSync(join(dir, ".env"), "utf-8"), "SCUTE_APP_ID=app_1\n");
});
