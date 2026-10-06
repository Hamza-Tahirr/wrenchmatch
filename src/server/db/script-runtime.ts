// Setup for command-line scripts (tsx) that import server modules; the app never imports
// this file. Import it FIRST, for its side effects, then load server modules with dynamic
// `await import(...)` inside an async function:
//
//   import { isMainModule } from "../src/server/db/script-runtime";
//   async function main() { const { migrate } = await import("../src/server/db/migrate"); ... }
//
// It (1) loads .env files the way `next dev` does, so scripts and the app agree on
// DATABASE_PATH/UPLOAD_DIR, and (2) resolves the `server-only` marker package to its empty
// "react-server" build. Next.js does that itself; plain Node would load the throwing build.
// This file deliberately does not import "server-only".

import fs from "node:fs";
import { createRequire, registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function loadEnvFiles(): void {
  const mode = process.env.NODE_ENV ?? "development";
  const files = [`.env.${mode}.local`, mode === "test" ? null : ".env.local", `.env.${mode}`, ".env"];
  for (const file of files) {
    const fullPath = file ? path.join(process.cwd(), file) : null;
    // Variables already set (including by an earlier, higher-priority file) are kept.
    if (fullPath && fs.existsSync(fullPath)) process.loadEnvFile(fullPath);
  }
}

function allowServerOnlyImports(): void {
  const projectRequire = createRequire(path.join(process.cwd(), "package.json"));
  const emptyModuleUrl = pathToFileURL(
    path.join(path.dirname(projectRequire.resolve("server-only")), "empty.js"),
  ).href;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "server-only") return { url: emptyModuleUrl, shortCircuit: true };
      return nextResolve(specifier, context);
    },
  });
}

const globalFlags = globalThis as typeof globalThis & { __wrenchmatchScriptRuntime?: boolean };
if (!globalFlags.__wrenchmatchScriptRuntime) {
  globalFlags.__wrenchmatchScriptRuntime = true;
  loadEnvFiles();
  allowServerOnlyImports();
}

/** True when the module whose `import.meta.url` is given is the script Node was started with. */
export function isMainModule(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const normalize = (file: string) => {
    const resolved = path.resolve(file).replace(/\.[cm]?[jt]s$/, "");
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(entry) === normalize(fileURLToPath(moduleUrl));
}
