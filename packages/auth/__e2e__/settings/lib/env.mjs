// The settings suite's configuration: environment variables, or a KEY=VALUE
// file outside the repo (SCUTE_E2E_ENV_FILE, default ../.sdk-live/e2e.env
// next to the js checkout). Never committed, never printed.
//
//   SCUTE_E2E_API_URL      the Scute API to test against (never production)
//   SCUTE_E2E_CONSOLE      a command that runs `rails runner` on that API;
//                          {script} is replaced by the script to run (else it
//                          is appended), e.g. `cd ../api && bin/rails runner`
//   SCUTE_E2E_PORT         the test page's port (default 4317)
//   SCUTE_E2E_BROKER_PORT  the local console broker's port (default 4318)
//   SCUTE_E2E_DASHBOARD_URL  optional: a dashboard whose sign-in page is read

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const defaultEnvFile = () => fileURLToPath(new URL("../../../../../../.sdk-live/e2e.env", import.meta.url));

function parse(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

const PRODUCTION_HOSTS = ["api.scute.io"];

export function loadSettingsEnv(processEnv = process.env) {
  const file = processEnv.SCUTE_E2E_ENV_FILE || defaultEnvFile();
  const fromFile = existsSync(file) ? parse(readFileSync(file, "utf8")) : {};
  const pick = (key) => (processEnv[key] || fromFile[key] || "").trim();

  const missing = ["SCUTE_E2E_API_URL", "SCUTE_E2E_CONSOLE"].filter((k) => !pick(k));
  if (missing.length) {
    return { ok: false, reason: `set ${missing.join(" and ")} (or put them in ${file}). See packages/auth/__e2e__/README.md.` };
  }
  const apiUrl = pick("SCUTE_E2E_API_URL").replace(/\/+$/, "");
  let host;
  try {
    host = new URL(apiUrl).hostname;
  } catch {
    return { ok: false, reason: "SCUTE_E2E_API_URL is not a URL" };
  }
  if (PRODUCTION_HOSTS.includes(host)) {
    return { ok: false, reason: "SCUTE_E2E_API_URL points at production; this suite changes settings and makes users, so it never runs there" };
  }
  return {
    ok: true,
    env: {
      apiUrl,
      consoleCommand: pick("SCUTE_E2E_CONSOLE"),
      pagePort: Number(pick("SCUTE_E2E_PORT") || 4317),
      brokerPort: Number(pick("SCUTE_E2E_BROKER_PORT") || 4318),
      dashboardUrl: pick("SCUTE_E2E_DASHBOARD_URL").replace(/\/+$/, "") || null,
    },
  };
}
