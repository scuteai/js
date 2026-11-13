import { existsSync, readFileSync, rmSync } from "node:fs";
import { STATE } from "./global-setup";

export default async function globalTeardown() {
  if (!existsSync(STATE)) return;
  const { pid } = JSON.parse(readFileSync(STATE, "utf8"));
  try {
    process.kill(-pid, "SIGTERM"); // the whole next dev process group
  } catch {
    // already gone
  }
  rmSync(STATE, { force: true });
}
