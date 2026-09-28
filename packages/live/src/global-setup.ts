import { loadEnv } from "./env";

// Runs once, before any test file: says in one line why the suite is
// skipped when there are no credentials. Never prints a value.
export default function setup() {
  const result = loadEnv();
  if (!result.ok) {
    console.log(`[scute live] skipped, ${result.reason}`);
  } else {
    console.log(`[scute live] running against ${result.env.baseUrl}${result.env.slow ? " (with the slow tests)" : ""}`);
  }
}
