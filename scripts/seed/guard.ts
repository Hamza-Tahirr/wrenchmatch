// The seed adds sample data to a freshly migrated database and nothing else: it refuses a
// database with missing migrations or existing data instead of mixing sample rows into it.
import { sql, type Kysely } from "kysely";

import type { DB } from "@/server/db/schema.generated";
import { listMigrationFiles } from "@/server/db/migrate";

/** Tables the seed writes to (service_categories comes from migration 0001 and is kept). */
const SEEDED_TABLES = [
  "users",
  "zip_centroids",
  "pilot_zips",
  "files",
  "mechanic_profiles",
  "repair_requests",
  "quotes",
  "bookings",
  "notifications",
  "email_outbox",
  "audit_events",
  "support_requests",
] as const satisfies readonly (keyof DB)[];

const RESET_HINT = 'Run "npm run db:reset" to recreate the local database with sample data (it deletes local data first).';

async function appliedMigrations(db: Kysely<DB>): Promise<string[]> {
  try {
    const result = await sql<{ version: string }>`SELECT version FROM schema_migrations ORDER BY version`.execute(db);
    return result.rows.map((row) => row.version);
  } catch {
    return [];
  }
}

export async function assertEmptyMigratedDatabase(db: Kysely<DB>): Promise<void> {
  const applied = new Set(await appliedMigrations(db));
  const missing = listMigrationFiles()
    .map((migration) => migration.version)
    .filter((version) => !applied.has(version));
  if (missing.length > 0) {
    throw new Error(`The database is missing migrations (${missing.join(", ")}). ${RESET_HINT}`);
  }

  const occupied: string[] = [];
  for (const table of SEEDED_TABLES) {
    const result = await sql<{ n: number }>`SELECT count(*) AS n FROM ${sql.table(table)}`.execute(db);
    const count = Number(result.rows[0]?.n ?? 0);
    if (count > 0) occupied.push(`${table}: ${count}`);
  }
  if (occupied.length > 0) {
    throw new Error(`The database already has data (${occupied.join(", ")}); the sample-data seed only fills an empty one. ${RESET_HINT}`);
  }
}
