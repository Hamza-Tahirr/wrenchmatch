import "server-only";

import fs from "node:fs";
import path from "node:path";

import type { Client, InStatement } from "@libsql/client";

import { splitSqlStatements } from "./split-sql";
import type { SqliteDatabase } from "./sqlite";

export const DEFAULT_MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

const MIGRATION_FILE = /^\d{4}_[A-Za-z0-9_-]+\.sql$/;

export type MigrationFile = { version: string; filePath: string };

/**
 * Every `*.sql` file in lexical (= numeric) order; the version is the file name without
 * `.sql`. A badly named file throws rather than being skipped or applied out of order.
 */
export function listMigrationFiles(dir: string = DEFAULT_MIGRATIONS_DIR): MigrationFile[] {
  const names = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of names) {
    if (!MIGRATION_FILE.test(name)) {
      throw new Error(`Migration file "${name}" must be named NNNN_description.sql (4-digit prefix).`);
    }
  }
  return names.map((name) => ({ version: name.slice(0, -".sql".length), filePath: path.join(dir, name) }));
}

const CREATE_MIGRATIONS_TABLE =
  "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)";
const RECORD_MIGRATION = "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)";

function ensureMigrationsTable(sqlite: SqliteDatabase): void {
  sqlite.exec(CREATE_MIGRATIONS_TABLE);
}

export function getAppliedVersions(sqlite: SqliteDatabase): string[] {
  ensureMigrationsTable(sqlite);
  return sqlite
    .prepare<[], { version: string }>("SELECT version FROM schema_migrations ORDER BY version")
    .all()
    .map((row) => row.version);
}

/**
 * First line of a migration that rebuilds a table other tables reference (SQLite's 12-step
 * ALTER TABLE procedure): the file then runs with foreign keys switched off, so dropping the
 * old table does not cascade, and is rolled back unless PRAGMA foreign_key_check is clean.
 */
export const FOREIGN_KEYS_OFF_DIRECTIVE = "-- migrate:foreign-keys-off";

function wantsForeignKeysOff(source: string): boolean {
  const firstLine = source.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  return firstLine.trim() === FOREIGN_KEYS_OFF_DIRECTIVE;
}

type ForeignKeyViolation = { table: string; rowid: number | null; parent: string; fkid: number };

function assertForeignKeysIntact(sqlite: SqliteDatabase, version: string): void {
  const violations = sqlite.prepare<[], ForeignKeyViolation>("PRAGMA foreign_key_check").all();
  if (violations.length === 0) return;
  const first = violations[0];
  throw new Error(
    `Migration ${version} left ${violations.length} foreign key violation(s) ` +
      `(first: ${first.table} row ${first.rowid ?? "?"} -> ${first.parent}); it was rolled back.`,
  );
}

/**
 * Runs `apply` with foreign key enforcement off, then restores the previous setting. The
 * pragma is a no-op inside a transaction, so an open transaction is refused.
 */
function withForeignKeysOff<T>(sqlite: SqliteDatabase, version: string, apply: () => T): T {
  if (sqlite.inTransaction) {
    throw new Error(`Migration ${version} needs foreign keys off, which cannot change inside an open transaction.`);
  }
  const wasOn = sqlite.pragma("foreign_keys", { simple: true }) === 1;
  sqlite.pragma("foreign_keys = OFF");
  try {
    if (sqlite.pragma("foreign_keys", { simple: true }) !== 0) {
      throw new Error(`Migration ${version}: could not switch foreign keys off.`);
    }
    return apply();
  } finally {
    if (wasOn) sqlite.pragma("foreign_keys = ON");
  }
}

/**
 * Applies pending migrations in order, each in its own `BEGIN IMMEDIATE` transaction together
 * with its schema_migrations row, so a failed file leaves no partial schema and concurrent
 * runs cannot apply a file twice. Idempotent. Returns the versions applied by this call.
 *
 * Migration files must not contain BEGIN/COMMIT or PRAGMA foreign_keys (they run inside a
 * transaction, where SQLite ignores that pragma). A file whose first line is
 * FOREIGN_KEYS_OFF_DIRECTIVE runs with foreign keys off around its transaction instead, and
 * fails (rolled back) unless PRAGMA foreign_key_check is clean before it commits.
 */
export function migrate(sqlite: SqliteDatabase, dir: string = DEFAULT_MIGRATIONS_DIR): string[] {
  ensureMigrationsTable(sqlite);
  const isApplied = sqlite.prepare<[string]>("SELECT 1 FROM schema_migrations WHERE version = ?");
  const record = sqlite.prepare<[string, string]>(RECORD_MIGRATION);

  const applied: string[] = [];
  for (const migration of listMigrationFiles(dir)) {
    if (isApplied.get(migration.version)) continue;
    const source = fs.readFileSync(migration.filePath, "utf8");
    const foreignKeysOff = wantsForeignKeysOff(source);
    const apply = sqlite.transaction(() => {
      // Checked again inside the write lock: another process may have applied it meanwhile.
      if (isApplied.get(migration.version)) return false;
      sqlite.exec(source);
      if (foreignKeysOff) assertForeignKeysIntact(sqlite, migration.version);
      record.run(migration.version, new Date().toISOString());
      return true;
    });
    const didApply = foreignKeysOff
      ? withForeignKeysOff(sqlite, migration.version, () => apply.immediate())
      : apply.immediate();
    if (didApply) applied.push(migration.version);
  }
  return applied;
}

// ---------------------------------------------------------------------------------
// libSQL (Turso, or a local `file:` URL)
// ---------------------------------------------------------------------------------

// Fails, which rolls the batch back, when PRAGMA foreign_key_check reports a violation: json()
// of a value from the violating row is never valid JSON. A batch cannot branch on a result, and
// the argument depends on the row so SQLite cannot evaluate it ahead of the rows.
const FAIL_ON_FOREIGN_KEY_VIOLATION = `SELECT json('!' || "table") FROM pragma_foreign_key_check LIMIT 1`;

async function isAppliedOnLibsql(client: Client, version: string): Promise<boolean> {
  const result = await client.execute({ sql: "SELECT 1 FROM schema_migrations WHERE version = ?", args: [version] });
  return result.rows.length > 0;
}

/** getAppliedVersions() for a libSQL database. */
export async function getAppliedVersionsOnLibsql(client: Client): Promise<string[]> {
  await client.execute(CREATE_MIGRATIONS_TABLE);
  const result = await client.execute("SELECT version FROM schema_migrations ORDER BY version");
  return result.rows.map((row) => String(row.version));
}

/**
 * migrate() for a libSQL database. Each pending file runs as one batch, libSQL's atomic unit
 * (one request to Turso), split into statements (split-sql.ts). Its schema_migrations row goes
 * first, so if another run applied the file meanwhile, the batch fails before changing
 * anything and the file is skipped. A file starting with FOREIGN_KEYS_OFF_DIRECTIVE runs
 * through client.migrate(), which switches foreign keys off around the batch, and is rolled
 * back unless PRAGMA foreign_key_check is clean at its end. Returns the versions applied.
 */
export async function migrateOnLibsql(client: Client, dir: string = DEFAULT_MIGRATIONS_DIR): Promise<string[]> {
  const done = new Set(await getAppliedVersionsOnLibsql(client));
  const applied: string[] = [];
  for (const migration of listMigrationFiles(dir)) {
    if (done.has(migration.version)) continue;
    const source = fs.readFileSync(migration.filePath, "utf8").replace(/^﻿/, "");
    const statements: InStatement[] = [
      { sql: RECORD_MIGRATION, args: [migration.version, new Date().toISOString()] },
      ...splitSqlStatements(source),
    ];
    const foreignKeysOff = wantsForeignKeysOff(source);
    try {
      if (foreignKeysOff) await client.migrate([...statements, FAIL_ON_FOREIGN_KEY_VIOLATION]);
      else await client.batch(statements, "write");
    } catch (error) {
      if (await isAppliedOnLibsql(client, migration.version)) continue;
      const failedAt = (error as { statementIndex?: unknown }).statementIndex;
      if (foreignKeysOff && failedAt === statements.length) {
        throw new Error(
          `Migration ${migration.version} left foreign key violation(s) (PRAGMA foreign_key_check); it was rolled back.`,
          { cause: error },
        );
      }
      throw error;
    }
    applied.push(migration.version);
  }
  return applied;
}
