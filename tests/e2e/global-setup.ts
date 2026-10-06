import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Recreates the sample data (npm run db:reset) before the suite, so every run starts from the
 * documented scenarios (docs/DEMO_DATA.md). Set E2E_SKIP_RESET=1 to keep the current database,
 * e.g. while other people are using the same dev server; the specs then work with what is
 * there and skip only the steps that need untouched sample records.
 */
export default function globalSetup(): void {
  if (process.env.E2E_SKIP_RESET === "1") {
    console.log("[e2e] E2E_SKIP_RESET=1: keeping the current database (no db:reset).");
    return;
  }
  const projectRoot = path.resolve(__dirname, "..", "..");
  // Run npm with the same Node.js that runs Playwright (the project's portable Node 24).
  const nodeDir = path.dirname(process.execPath);
  console.log("[e2e] Resetting the database with npm run db:reset ...");
  execSync("npm run db:reset", {
    cwd: projectRoot,
    stdio: "inherit",
    timeout: 600_000,
    env: { ...process.env, PATH: `${nodeDir}${path.delimiter}${process.env.PATH ?? ""}` },
  });
}
