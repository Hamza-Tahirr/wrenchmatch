// Regenerates src/server/db/schema.generated.ts from db/migrations (npm run db:types):
// applies every migration to an in-memory database and renders Kysely interfaces from it.
import "../src/server/db/script-runtime";

import fs from "node:fs";
import path from "node:path";

const OUTPUT = path.join(process.cwd(), "src", "server", "db", "schema.generated.ts");

async function main(): Promise<void> {
  const { default: Database } = await import("better-sqlite3");
  const { migrate } = await import("../src/server/db/migrate");
  const { isSameGeneratedSource, renderSchemaTypes } = await import("../src/server/db/schema-types");

  const sqlite = new Database(":memory:");
  try {
    sqlite.pragma("foreign_keys = ON");
    const versions = migrate(sqlite);
    const source = renderSchemaTypes(sqlite);
    const previous = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, "utf8") : null;
    if (isSameGeneratedSource(previous, source)) {
      console.log(`Schema types are up to date (${versions.length} migrations).`);
      return;
    }
    fs.writeFileSync(OUTPUT, source, "utf8");
    console.log(`Wrote ${path.relative(process.cwd(), OUTPUT)} from ${versions.length} migrations.`);
  } finally {
    sqlite.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
