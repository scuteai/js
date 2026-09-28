import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";
import { loadEnv } from "./env";

declare module "vitest" {
  export interface ProvidedContext {
    /** Where the test run writes what it wants said at the very end (known bugs, cleanup). */
    summaryFile: string;
  }
}

// Runs once, in the main process: says in one line why the suite is skipped
// when there are no credentials, and at the end prints the run's summary
// (which known bugs still reproduce, what cleanup couldn't delete). Printed
// here because vitest hides test output of passing tests in some reporters.
// Never prints a value.
export default function setup(project: TestProject) {
  const result = loadEnv();
  if (!result.ok) {
    console.log(`[scute live] skipped, ${result.reason}`);
    return;
  }
  console.log(`[scute live] running against ${result.env.baseUrl}${result.env.slow ? " (with the slow tests)" : ""}`);

  const summaryFile = join(tmpdir(), `scute-live-js-${process.pid}-${Date.now()}.txt`);
  project.provide("summaryFile", summaryFile);
  return () => {
    if (!existsSync(summaryFile)) return;
    console.log(readFileSync(summaryFile, "utf8"));
    unlinkSync(summaryFile);
  };
}
