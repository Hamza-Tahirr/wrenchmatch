import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Forward slashes keep Vite's id handling consistent on Windows.
const fromRoot = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url)).replaceAll("\\", "/");

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${fromRoot("./src")}/` },
      // Next.js resolves "server-only" to an empty module on the server; do the same here.
      { find: /^server-only$/, replacement: fromRoot("./tests/support/empty-module.ts") },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", ".tools/**", ".data/**"],
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
