// Test databases: each call gets a fresh temp directory with a migrated SQLite file, its own
// upload directory and a fixed clock. Use one per test file (beforeAll/afterAll) or per test.
//
//   let t: TestContext;
//   beforeEach(() => { t = createTestContext(); });
//   afterEach(() => t.cleanup());
//
// ctx.db runs on better-sqlite3, the local driver. With TEST_DB_DRIVER=libsql, or
// `npm run test:libsql` (vitest --mode libsql), it runs on the libSQL driver the app uses with
// Turso, here on the same file through a `file:` URL (libsql's SQLite 3.45 engine). Either way
// `sqlite` is a better-sqlite3 connection to that file, for direct SQL in constraint tests.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import v8 from "node:v8";
import vm from "node:vm";

import type { Kysely } from "kysely";

import type { AppContext } from "@/server/context";
import { createLibsqlKysely } from "@/server/db/libsql";
import { migrate } from "@/server/db/migrate";
import type { DB } from "@/server/db/schema.generated";
import { closeKysely, createKysely, openSqlite, type SqliteDatabase } from "@/server/db/sqlite";
import { createLocalFileStorage } from "@/server/storage/local-storage";

/** Monday 5 Oct 2026, 10:00 in America/Phoenix (UTC-7 all year, no DST). */
export const DEFAULT_TEST_NOW = new Date("2026-10-05T17:00:00.000Z");

/** The driver behind ctx.db in this run. */
export const TEST_DB_DRIVER: "sqlite" | "libsql" =
  process.env.TEST_DB_DRIVER === "libsql" || process.env.MODE === "libsql" ? "libsql" : "sqlite";

// Every connection in a test shares one event loop, so waiting for another one's lock can only
// end in SQLITE_BUSY: fail fast (the race tests set the same on their better-sqlite3 handles).
const LIBSQL_BUSY_TIMEOUT_MS = 200;

const DB_FILE = "app.db";

export type TestContext = {
  /** AppContext on the test database: ctx.db, ctx.now (fixed), ctx.storage (temp uploads). */
  ctx: AppContext;
  /** A better-sqlite3 connection to the test database (the one behind ctx.db on that driver). */
  sqlite: SqliteDatabase;
  /** Temp directory holding the database file and uploads/. */
  dir: string;
  /** Closes every connection opened on this database and deletes the directory. */
  cleanup: () => Promise<void>;
};

export type ExtraConnection = {
  sqlite: SqliteDatabase;
  db: Kysely<DB>;
  close: () => Promise<void>;
};

const openConnections = new Map<string, Set<ExtraConnection>>();

let collectGarbage: (() => void) | null = null;

/**
 * Deletes a test directory. libSQL's local library closes a database file only when its
 * statements are garbage-collected (their finalizers run on the event loop), so on Windows a
 * folder it used stays locked for a while after client.close(): collect garbage, wait, retry.
 */
export async function removeTestDirectory(dir: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      // The codes rmSync's own retries cover (a virus scanner can hold a file briefly, too).
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (attempt >= 10 || !["EPERM", "EBUSY", "ENOTEMPTY", "EMFILE", "ENFILE"].includes(code)) throw error;
      if (!collectGarbage) {
        // gc() is not exposed by default: allow it, then take it from a new context.
        v8.setFlagsFromString("--expose-gc");
        const gc: unknown = vm.runInNewContext("gc");
        if (typeof gc !== "function") throw error;
        collectGarbage = () => gc();
      }
      collectGarbage();
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt));
    }
  }
}

/**
 * The error a promise rejects with, its stack (and its causes') formatted: until then V8 keeps
 * the stack frames' receivers alive, and for a failed statement on a local libSQL client that
 * keeps the test database open. Use it instead of expect().rejects for direct client calls.
 */
export async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    for (let current: unknown = error; current instanceof Error; current = current.cause) void current.stack;
    if (error instanceof Error) return error;
    throw new Error(`Rejected with a non-Error value: ${String(error)}`);
  }
  throw new Error("Expected the promise to reject.");
}

/** ctx.db for the test database at `file`, on the driver this run uses. */
function openTestDb(file: string, sqlite: SqliteDatabase): Kysely<DB> {
  if (TEST_DB_DRIVER === "sqlite") return createKysely(sqlite);
  return createLibsqlKysely({ url: pathToFileURL(file).href, busyTimeoutMs: LIBSQL_BUSY_TIMEOUT_MS });
}

export function createTestContext(options: { now?: Date } = {}): TestContext {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wrenchmatch-test-"));
  const file = path.join(dir, DB_FILE);
  const sqlite = openSqlite(file);
  migrate(sqlite);
  const db = openTestDb(file, sqlite);
  const ctx: AppContext = {
    db,
    now: new Date((options.now ?? DEFAULT_TEST_NOW).getTime()),
    storage: createLocalFileStorage(path.join(dir, "uploads")),
  };

  const cleanup = async () => {
    for (const connection of [...(openConnections.get(dir) ?? [])]) await connection.close();
    openConnections.delete(dir);
    await closeKysely(db, sqlite);
    await removeTestDirectory(dir);
  };
  return { ctx, sqlite, dir, cleanup };
}

/**
 * A second, independent connection to the same test database (as another server process
 * would have), for race tests. Closed automatically by the owning context's cleanup().
 */
export function openExtraConnection(dir: string): ExtraConnection {
  const file = path.join(dir, DB_FILE);
  const sqlite = openSqlite(file, { fileMustExist: true });
  const db = openTestDb(file, sqlite);
  const connections = openConnections.get(dir) ?? new Set<ExtraConnection>();
  openConnections.set(dir, connections);
  const connection: ExtraConnection = {
    sqlite,
    db,
    close: async () => {
      connections.delete(connection);
      await closeKysely(db, sqlite);
    },
  };
  connections.add(connection);
  return connection;
}

/** The same context at another instant, e.g. `withNow(ctx, "2026-10-13T00:00:00.000Z")`. */
export function withNow(ctx: AppContext, now: Date | string): AppContext {
  return { ...ctx, now: typeof now === "string" ? new Date(now) : new Date(now.getTime()) };
}
