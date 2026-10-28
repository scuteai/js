import { test } from "node:test";
import assert from "node:assert/strict";
import { FRAMEWORKS, changedProps, jsxOf, sdkRecipe, sdkRecipes } from "../src/recipes.mjs";

const NONE = { appearance: {}, copy: {}, legal: {}, methods: {} };

test("every framework has a recipe with packages, an env line and files", () => {
  const all = sdkRecipes("app_1");
  assert.deepEqual(all.map((r) => r.id), ["nextjs", "react", "javascript", "node", "astro", "remix", "tanstack"]);
  assert.deepEqual(all.map((r) => r.id), FRAMEWORKS.map((f) => f.id));
  for (const r of all) {
    assert.ok(r.packages.length > 0, r.id);
    assert.equal(r.install, `npm install ${r.packages.join(" ")}`);
    assert.match(r.env, /^[A-Z_]+=app_1$/);
    assert.ok(r.files.length > 0, r.id);
    for (const f of r.files) assert.ok(!f.path.startsWith("/") && !f.path.split("/").includes(".."), f.path);
    if (r.files.length === 1) assert.equal(r.code, r.files[0].code);
    else for (const f of r.files) assert.ok(r.code.includes(`// ${f.path}\n${f.code}`));
    // Every package the code imports is installed (or comes with the framework).
    const imported = new Set([...r.code.matchAll(/from "(@scute\/[^"]+)"/g)].map((m) => m[1]));
    for (const p of imported) assert.ok(r.packages.includes(p), `${r.id} imports ${p}`);
  }
});

test("no file opts out of type checking", () => {
  for (const r of sdkRecipes("app_1")) assert.ok(!r.code.includes("@ts-nocheck"), r.id);
});

test("Next.js: the auth route and the providers, reading the env itself", () => {
  const r = sdkRecipe("nextjs", "app_1");
  assert.deepEqual(r.files.map((f) => f.path), ["src/app/auth/[...scute]/route.ts", "src/app/scute-providers.tsx"]);
  assert.equal(r.envFile, ".env.local");
  assert.equal(r.env, "NEXT_PUBLIC_SCUTE_APP_ID=app_1");
});

test("sign-in choices that differ from the defaults go into the gate's props", () => {
  const s = { ...NONE, appearance: { theme: "light", accentColor: "#ff0000" }, copy: { title: " Welcome " } };
  assert.deepEqual(changedProps(s), { appearance: { accentColor: "#ff0000" }, copy: { title: "Welcome" } });
  assert.equal(jsxOf("ScuteAuthGate", NONE, 0, "{children}"), "<ScuteAuthGate>{children}</ScuteAuthGate>");
  const code = sdkRecipe("react", "app_1", s).code;
  assert.ok(code.includes('appearance={{ accentColor: "#ff0000" }}'));
  assert.ok(code.includes('copy={{ title: "Welcome" }}'));
  const js = sdkRecipe("javascript", "app_1", s).code;
  assert.ok(js.includes("--accent: #ff0000") && js.includes("<h1>Welcome</h1>"));
});

test("an unknown framework says which exist", () => {
  assert.throws(() => sdkRecipe("svelte", "app_1"), /One of: nextjs, react/);
});
