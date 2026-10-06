import { defineConfig } from "@playwright/test";

// End-to-end suite (tests/e2e) in the installed Google Chrome. It drives the real UI of the
// dev server on http://localhost:3000 and checks results against the SQLite database with
// read-only lookups. tests/e2e/global-setup.ts recreates the sample data first
// (npm run db:reset) unless E2E_SKIP_RESET=1.

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The dev server compiles pages on first visit (and recompiles while code changes).
    navigationTimeout: 90_000,
    actionTimeout: 30_000,
  },
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      testMatch: /responsive\.spec\.ts$/,
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
  ],
  webServer: {
    command: "npm run dev -- -p 3000 -H 127.0.0.1",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
