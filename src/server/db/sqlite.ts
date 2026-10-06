import "server-only";

import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";

import type { DB } from "./schema.generated";
import { withTransactionGuard } from "./tx";

// The local SQLite driver (better-sqlite3, a native module). The app loads this file only when
// it uses the local database file (see client.ts), so a deployment on libSQL never loads it;
// scripts and tests import it directly.

export type SqliteDatabase = Database.Database;

/** Opens a SQLite file with the pragmas every connection in this app uses. */
export function openSqlite(
  filePath: string,
  options: { fileMustExist?: boolean } = {},
): SqliteDatabase {
  const sqlite = new Database(filePath, { fileMustExist: options.fileMustExist ?? false });
  try {
    // busy_timeout first so switching to WAL waits for, rather than fails on, another writer.
    sqlite.pragma("busy_timeout = 5000");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("synchronous = NORMAL");
    sqlite.pragma("foreign_keys = ON");
  } catch (error) {
    sqlite.close();
    throw error;
  }
  return sqlite;
}

/**
 * Wraps an open connection in Kysely. Column names stay snake_case (no CamelCasePlugin);
 * DTOs map them to camelCase explicitly. Destroying the Kysely instance closes `sqlite`.
 */
export function createKysely(sqlite: SqliteDatabase): Kysely<DB> {
  return withTransactionGuard(new Kysely<DB>({ dialect: new SqliteDialect({ database: sqlite }) }));
}

/** Closes a Kysely instance and its connection (destroy() alone skips a never-used driver). */
export async function closeKysely(db: Kysely<DB>, sqlite: SqliteDatabase): Promise<void> {
  await db.destroy();
  if (sqlite.open) sqlite.close();
}

/** Throws the db:reset hint unless the migrations have run on this database. */
export function assertSchemaPresent(sqlite: SqliteDatabase, filePath: string): void {
  const table = sqlite
    .prepare("SELECT 1 AS present FROM sqlite_schema WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  if (!table) {
    throw new Error(
      `The database at ${filePath} has no schema. Run "npm run db:reset" to create and seed it.`,
    );
  }
}
