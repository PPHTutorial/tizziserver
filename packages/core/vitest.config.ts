import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    // integration tests share one Postgres — run them serially
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
