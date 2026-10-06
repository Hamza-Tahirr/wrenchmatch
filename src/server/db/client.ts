import "server-only";

import fs from "node:fs";

import { Kysely, SqliteDialect } from "kysely";

import { DATABASE_PATH, TURSO_AUTH_TOKEN, TURSO_DATABASE_URL } from "@/server/config";
import { createLibsqlKysely } from "./libsql";
import type { DB } from "./schema.generated";
import { withTransactionGuard } from "./tx";

// The app's database: the libSQL database at TURSO_DATABASE_URL when that is set (Turso, on
// Vercel), otherwise the local SQLite file at DATABASE_PATH. Each driver loads with the first
// query (better-sqlite3 from ./sqlite, @libsql/client from ./libsql), so a deployment on
// Turso never loads the native better-sqlite3 module.

export type { SqliteDatabase } from "./sqlite";

/**
 * A new handle on the local SQLite file (default DATABASE_PATH), whatever TURSO_DATABASE_URL
 * says. The file must exist; better-sqlite3 opens it with the first query, after checking that
 * the migrations have run. Close it with `db.destroy()`.
 */
export function openSqliteDb(filePath: string = DATABASE_PATH): Kysely<DB> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No database found at ${filePath}. Run "npm run db:reset" to create and seed it.`);
  }
  return withTransactionGuard(
    new Kysely<DB>({
      dialect: new SqliteDialect({
        database: async () => {
          const { assertSchemaPresent, openSqlite } = await import("./sqlite");
          const sqlite = openSqlite(filePath, { fileMustExist: true });
          try {
            assertSchemaPresent(sqlite, filePath);
          } catch (error) {
            sqlite.close();
            throw error;
          }
          return sqlite;
        },
      }),
    }),
  );
}

type CachedDb = { target: string; db: Kysely<DB> };

// Cached on globalThis so Next.js dev-mode module reloading does not open a new handle per edit.
const globalCache = globalThis as typeof globalThis & { __wrenchmatchDb?: CachedDb };

/**
 * The process-wide database handle for request handling: libSQL at TURSO_DATABASE_URL, or the
 * SQLite file at DATABASE_PATH. The connection opens with the first query, which also checks
 * the schema (once per process).
 */
export function getDb(): Kysely<DB> {
  const target = TURSO_DATABASE_URL ? `libsql:${TURSO_DATABASE_URL}` : `sqlite:${DATABASE_PATH}`;
  const cached = globalCache.__wrenchmatchDb;
  if (cached && cached.target === target) return cached.db;

  const db = TURSO_DATABASE_URL
    ? createLibsqlKysely({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN })
    : openSqliteDb(DATABASE_PATH);
  if (cached) void cached.db.destroy().catch(() => undefined);
  globalCache.__wrenchmatchDb = { target, db };
  return db;
}

/** Closes the process-wide handle, if open (for scripts that finish with the database). */
export async function closeDb(): Promise<void> {
  const cached = globalCache.__wrenchmatchDb;
  globalCache.__wrenchmatchDb = undefined;
  if (cached) await cached.db.destroy();
}
