import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 40_000,
    hookTimeout: 40_000,
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
  },
});
