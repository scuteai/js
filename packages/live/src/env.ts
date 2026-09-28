// Where the live suite gets its credentials: the process environment, or a
// small KEY=VALUE file outside the repo (never committed). Values are never
// printed; only which keys are missing and where we looked.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const KEYS = ["SCUTE_LIVE_BASE_URL", "SCUTE_LIVE_APP_ID", "SCUTE_LIVE_SECRET"] as const;
type Key = (typeof KEYS)[number];

export type LiveEnv = {
  baseUrl: string;
  appId: string;
  secret: string;
  /** SCUTE_LIVE_SLOW=1: also run the tests that wait out real time windows (minutes). */
  slow: boolean;
};

export type EnvResult = { ok: true; env: LiveEnv } | { ok: false; reason: string };

/**
 * `_devshop/.sdk-live/js.env`: this file is packages/live/src/env.ts inside a
 * checkout of the js repo that sits in _devshop (js/ or js-live/).
 */
export const defaultEnvFile = () => fileURLToPath(new URL("../../../../.sdk-live/js.env", import.meta.url));

export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
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

export function loadEnv(processEnv: NodeJS.ProcessEnv = process.env): EnvResult {
  const file = processEnv.SCUTE_LIVE_ENV_FILE || defaultEnvFile();
  const fromFile = existsSync(file) ? parseEnvFile(readFileSync(file, "utf8")) : {};
  const pick = (key: Key) => (processEnv[key] || fromFile[key] || "").trim();

  const missing = KEYS.filter((k) => !pick(k));
  if (missing.length) {
    const where = existsSync(file) ? `${file} (it lacks ${missing.join(", ")})` : `${file} (not found)`;
    return {
      ok: false,
      reason: `no credentials: set ${KEYS.join(", ")} or put them in ${where}. See packages/live/README.md.`,
    };
  }

  const slowFlag = (processEnv.SCUTE_LIVE_SLOW || fromFile.SCUTE_LIVE_SLOW || "").trim();
  return {
    ok: true,
    env: {
      baseUrl: pick("SCUTE_LIVE_BASE_URL").replace(/\/+$/, ""),
      appId: pick("SCUTE_LIVE_APP_ID"),
      secret: pick("SCUTE_LIVE_SECRET"),
      slow: slowFlag === "1" || slowFlag.toLowerCase() === "true",
    },
  };
}
