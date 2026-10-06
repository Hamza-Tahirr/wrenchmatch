// Sample data for local development: `npm run db:reset` calls seed() on a freshly migrated
// database (`npm run db:seed` runs it directly, on an empty migrated database only).
// Everything it creates is fictional and flagged internally: sample logins have
// users.is_demo_account = 1; requests, quotes and post-booking records are is_demo_fixture = 1.
// Dates are relative to the moment it runs. See docs/DEMO_DATA.md.
import { isMainModule } from "../src/server/db/script-runtime";

import type { SeedOptions, SeedSummary } from "./seed/types";

export type { SeedOptions, SeedSummary } from "./seed/types";

/**
 * Fills an empty, migrated database with the sample data set. Throws, without touching any
 * database, when NODE_ENV=production; throws when the database is not empty.
 */
export async function seed(options: SeedOptions = {}): Promise<SeedSummary> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed sample data while NODE_ENV=production.");
  }
  // Loaded only now: server modules need script-runtime's "server-only" resolution first.
  const { runSeed } = await import("./seed/run");
  if (options.db) return runSeed(options);

  // By default the local file, even when TURSO_DATABASE_URL is set: the sample pictures go to
  // UPLOAD_DIR, so database and files stay together (npm run db:push:remote copies the result).
  const { DATABASE_PATH } = await import("../src/server/config");
  const { openSqliteDb } = await import("../src/server/db/client");
  const db = openSqliteDb(DATABASE_PATH);
  try {
    return await runSeed({ ...options, db });
  } finally {
    await db.destroy();
  }
}

if (isMainModule(import.meta.url)) {
  const main = async () => {
    try {
      const summary = await seed();
      console.log(`Seeded ${summary.accounts.length} sample accounts. Try customer@example.com (see docs/DEMO_DATA.md).`);
    } finally {
      const { closeDb } = await import("../src/server/db/client");
      await closeDb();
    }
  };
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
