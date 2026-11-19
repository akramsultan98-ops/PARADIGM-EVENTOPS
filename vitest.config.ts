import { defineConfig } from "vitest/config";
import path from "node:path";

const testDb = process.env.TEST_DATABASE_URL ?? "postgresql://eventops:eventops_dev@localhost:5432/eventops_test?schema=public";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/support/server-only.ts") } },
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 300000,
    projects: [
      { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      { extends: true, test: { name: "integration", include: ["tests/integration/**/*.test.ts"], globalSetup: ["tests/support/global-setup.ts"], env: { DATABASE_URL: testDb } } },
    ],
  },
});
