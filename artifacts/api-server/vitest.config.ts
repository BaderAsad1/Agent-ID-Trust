import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/__tests__/**/*.unit.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: ["src/__tests__/**/*.integration.test.ts"],
          environment: "node",
          testTimeout: 60000,
          hookTimeout: 60000,
          setupFiles: [],
          fileParallelism: false,
          maxWorkers: 1,
        },
      },
      {
        test: {
          name: "security",
          include: [
            "src/__tests__/security.test.ts",
            "src/__tests__/ssrf-guard.test.ts",
            "src/__tests__/**/*.security.test.ts",
          ],
          environment: "node",
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@workspace/db": path.resolve("../../lib/db/src"),
    },
  },
});
