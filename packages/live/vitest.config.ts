import { defineConfig } from "vitest/config";

// The live suite: real HTTP against a real Scute API, no mocks. Files end in
// .live.ts so no other vitest run picks them up by accident, and they run one
// at a time, in order (later tests build on what earlier ones set up).
export default defineConfig({
  test: {
    include: ["src/**/*.live.ts"],
    environment: "node",
    globalSetup: ["./src/global-setup.ts"],
    fileParallelism: false,
    sequence: { concurrent: false, shuffle: false },
    testTimeout: 120_000,
    hookTimeout: 300_000,
    retry: 0,
  },
});
