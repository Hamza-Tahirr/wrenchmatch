import "server-only";

import type { Client, InValue, IntMode, ResultSet, Transaction } from "@libsql/client";
import {
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
  type QueryResult,
} from "kysely";

import { readSqliteFailure, type SqliteFailure } from "@/server/errors";
import type { DB } from "./schema.generated";
import { withTransactionGuard } from "./tx";

// libSQL through @libsql/client: Turso in production (TURSO_DATABASE_URL), a local `file:` URL
// in tests and scripts. The Kysely dialect is adapted from @libsql/kysely-libsql with two
// changes this app needs: a transaction is a write transaction (BEGIN IMMEDIATE, as writeTx
// uses on better-sqlite3), and the transaction statements writeTx sends as plain SQL are
// mapped onto that client transaction (see LibsqlConnection). Results and errors take the
// shapes better-sqlite3 gives them, so code behaves the same on either driver.

/**
 * A failed statement as better-sqlite3 reports it: `code` is SQLite's most specific result
 * code ("SQLITE_CONSTRAINT_TRIGGER") and `message` SQLite's own message ("slot_conflict"),
 * without the prefixes libSQL adds. The libSQL error is the `cause`.
 */
export class SqliteError extends Error {
  readonly code: string;

  constructor(failure: SqliteFailure, cause: unknown) {
    super(failure.message, { cause });
    this.name = "SqliteError";
    this.code = failure.code;
  }
}

/** A libSQL database: `libsql://` or `https://` (Turso) or `file:` (a local file). */
export type LibsqlTarget = {
  url: string;
  /** Turso auth token; not used for `file:` URLs. */
  authToken?: string | null;
  /** How long a `file:` connection waits for another writer (default 5000 ms); Turso ignores it. */
  busyTimeoutMs?: number;
};

/** True for a local `file:` URL, served in this process by the native libsql library. */
export function isLocalLibsqlUrl(url: string): boolean {
  return /^file:/i.test(url.trim());
}

/** The URL without query string, fragment or credentials, for logs and error messages. */
export function describeLibsqlUrl(url: string): string {
  return url.trim().replace(/[?#].*$/, "").replace(/\/\/[^/@]*@/, "//");
}

/** Same busy timeout as better-sqlite3 connections (openSqlite). */
const LOCAL_BUSY_TIMEOUT_MS = 5000;

/**
 * Opens a client, loading @libsql/client on first use. A remote database uses its web build,
 * which speaks HTTP through fetch() and needs no native module (what Turso recommends on
 * Vercel); a `file:` URL needs the Node build, i.e. the native libsql library (SQLite 3.45,
 * the engine Turso runs). Integers arrive as numbers unless `intMode` says otherwise.
 */
export async function openLibsqlClient(
  target: LibsqlTarget,
  options: { intMode?: IntMode } = {},
): Promise<Client> {
  const { intMode } = options;
  if (isLocalLibsqlUrl(target.url)) {
    const { createClient } = await import("@libsql/client");
    return createClient({ url: target.url, timeout: target.busyTimeoutMs ?? LOCAL_BUSY_TIMEOUT_MS, intMode });
  }
  const { createClient } = await import("@libsql/client/web");
  return createClient({ url: target.url, authToken: target.authToken ?? undefined, intMode });
}

/**
 * Fails with a clear message unless the database has the app's schema and enforces foreign
 * keys (one query, so one round trip to Turso). libSQL turns them on for every connection by
 * default; the schema's references and cascades depend on that, and the app cannot switch
 * them on for the separate connection each remote request gets.
 */
export async function assertLibsqlDatabaseReady(client: Client, target: LibsqlTarget): Promise<void> {
  const result = await client.execute(
    "SELECT (SELECT count(*) FROM sqlite_schema WHERE type = 'table' AND name = 'schema_migrations') AS migrated, " +
      "(SELECT foreign_keys FROM pragma_foreign_keys) AS foreign_keys",
  );
  const row = result.rows[0];
  const where = describeLibsqlUrl(target.url);
  if (Number(row?.migrated) !== 1) {
    throw new Error(
      `The database at ${where} has no schema. Run "npm run db:push:remote" to copy the local database to it.`,
    );
  }
  if (Number(row?.foreign_keys) !== 1) {
    throw new Error(
      `The database at ${where} does not enforce foreign keys (PRAGMA foreign_keys = 0); the app relies on them.`,
    );
  }
}

/**
 * A Kysely handle on a libSQL database with the same misuse guard as createKysely(). The client
 * opens with the first query, after assertLibsqlDatabaseReady() (once per handle);
 * `db.destroy()` closes it.
 */
export function createLibsqlKysely(target: LibsqlTarget): Kysely<DB> {
  return withTransactionGuard(
    new Kysely<DB>({
      dialect: new LibsqlDialect({
        openClient: () => openLibsqlClient(target),
        onOpen: (client) => assertLibsqlDatabaseReady(client, target),
        // A remote database serves every statement as its own HTTP request, so independent
        // queries (a page's Promise.all) can run in parallel. A local file is a pool of
        // synchronous connections in this process: a second writer would block the event loop
        // waiting for the lock, so queries there take turns, as on better-sqlite3.
        multipleConnections: !isLocalLibsqlUrl(target.url),
      }),
    }),
  );
}

type LibsqlDialectConfig = {
  /** Opens the client when Kysely first needs it; the driver closes it on destroy(). */
  openClient: () => Promise<Client>;
  /** Runs once on the new client; if it throws, the client is closed and the query fails. */
  onOpen?: (client: Client) => Promise<void>;
  /** False makes Kysely hand out one connection at a time (as SQLite dialects do). */
  multipleConnections: boolean;
};

class LibsqlDialect implements Dialect {
  readonly #config: LibsqlDialectConfig;

  constructor(config: LibsqlDialectConfig) {
    this.#config = config;
  }

  createAdapter(): DialectAdapter {
    return new LibsqlAdapter(this.#config.multipleConnections);
  }

  createDriver(): Driver {
    return new LibsqlDriver(this.#config);
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }
}

class LibsqlAdapter extends SqliteAdapter {
  readonly #multipleConnections: boolean;

  constructor(multipleConnections: boolean) {
    super();
    this.#multipleConnections = multipleConnections;
  }

  override get supportsMultipleConnections(): boolean {
    return this.#multipleConnections;
  }
}

class LibsqlDriver implements Driver {
  readonly #config: LibsqlDialectConfig;
  #client: Client | null = null;

  constructor(config: LibsqlDialectConfig) {
    this.#config = config;
  }

  async init(): Promise<void> {
    const client = await this.#config.openClient();
    try {
      await this.#config.onOpen?.(client);
    } catch (error) {
      client.close();
      throw error;
    }
    this.#client = client;
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    if (!this.#client) throw new Error("The libSQL client is not open.");
    return new LibsqlConnection(this.#client);
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await asLibsqlConnection(connection).begin();
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await asLibsqlConnection(connection).commit();
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await asLibsqlConnection(connection).rollback();
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    asLibsqlConnection(connection).closeTransaction();
  }

  async destroy(): Promise<void> {
    this.#client?.close();
    this.#client = null;
  }
}

function asLibsqlConnection(connection: DatabaseConnection): LibsqlConnection {
  if (connection instanceof LibsqlConnection) return connection;
  throw new TypeError("Expected a connection created by the libSQL driver.");
}

// Transaction statements as writeTx and Kysely's SQLite drivers send them (no parameters).
const BEGIN_SQL = /^\s*begin(\s+(deferred|immediate|exclusive))?(\s+transaction)?\s*;?\s*$/i;
const COMMIT_SQL = /^\s*(commit|end)(\s+transaction)?\s*;?\s*$/i;
const ROLLBACK_SQL = /^\s*rollback(\s+transaction)?\s*;?\s*$/i;

/**
 * One Kysely connection. libSQL runs every client.execute() on a connection of its own (for
 * Turso, its own HTTP request), so plain BEGIN and COMMIT statements would not hold anything
 * together. Here BEGIN opens a client.transaction("write") instead, every statement until
 * COMMIT or ROLLBACK runs inside it, and COMMIT or ROLLBACK finishes it: writeTx's raw
 * `begin immediate` / `commit` / `rollback` and Kysely's transaction API both end up here.
 */
class LibsqlConnection implements DatabaseConnection {
  readonly #client: Client;
  #transaction: Transaction | null = null;

  constructor(client: Client) {
    this.#client = client;
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const { sql, parameters } = compiledQuery;
    if (parameters.length === 0 && (await this.#runTransactionStatement(sql))) return { rows: [] };
    const args = parameters.map(toSqlValue);
    const result = await this.#guard(() => (this.#transaction ?? this.#client).execute({ sql, args }));
    return toQueryResult<R>(result);
  }

  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("The libSQL driver does not support streaming queries.");
  }

  /** Opens a write transaction (BEGIN IMMEDIATE) for the statements that follow. */
  async begin(): Promise<void> {
    if (this.#transaction) throw new Error("cannot start a transaction within a transaction");
    this.#transaction = await this.#guard(() => this.#client.transaction("write"));
  }

  async commit(): Promise<void> {
    const transaction = this.#takeTransaction("commit");
    try {
      await this.#guard(() => transaction.commit());
    } finally {
      transaction.close();
    }
  }

  async rollback(): Promise<void> {
    const transaction = this.#takeTransaction("rollback");
    try {
      await transaction.rollback();
    } finally {
      transaction.close();
    }
  }

  /** Rolls back a transaction still open when Kysely releases the connection. */
  closeTransaction(): void {
    const transaction = this.#transaction;
    this.#transaction = null;
    transaction?.close();
  }

  /** Runs BEGIN, COMMIT or ROLLBACK; false for any other statement. */
  async #runTransactionStatement(sql: string): Promise<boolean> {
    if (BEGIN_SQL.test(sql)) await this.begin();
    else if (COMMIT_SQL.test(sql)) await this.commit();
    else if (ROLLBACK_SQL.test(sql)) await this.rollback();
    else return false;
    return true;
  }

  #takeTransaction(action: "commit" | "rollback"): Transaction {
    const transaction = this.#transaction;
    if (!transaction) throw new Error(`cannot ${action} - no transaction is active`);
    this.#transaction = null;
    return transaction;
  }

  /**
   * Runs `operation`; a failed statement is rethrown as a SqliteError. On a local file it tidies
   * up first. The libsql library leaves a statement that got SQLITE_BUSY active on its pooled
   * connection, where the next COMMIT would fail ("SQL statements in progress"), so the client
   * reopens its connections (queries on a local file take turns, multipleConnections: false, so
   * none is cut off). And the error's stack is formatted: until then V8 keeps the failed
   * statement, and so the database file, open for as long as the error lives.
   */
  async #guard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (this.#client.protocol === "file") {
        for (let current: unknown = error; current instanceof Error; current = current.cause) void current.stack;
        const code = (error as { code?: unknown } | null)?.code;
        if (typeof code === "string" && code.startsWith("SQLITE_BUSY")) this.#client.reconnect();
      }
      const failure = readSqliteFailure(error);
      throw failure ? new SqliteError(failure, error) : error;
    }
  }
}

/** Binds exactly what better-sqlite3 binds, and refuses anything else with its message. */
function toSqlValue(value: unknown): InValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return value;
  }
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return value;
  throw new TypeError("SQLite3 can only bind numbers, strings, bigints, buffers, and null");
}

/**
 * Results shaped like Kysely's better-sqlite3 driver returns them: plain row objects keyed by
 * column name (a repeated name keeps its last value) with BLOBs as Buffers, and an affected-row
 * count only for statements that return no rows.
 */
function toQueryResult<R>(result: ResultSet): QueryResult<R> {
  const { columns } = result;
  if (columns.length === 0) {
    return { rows: [], numAffectedRows: BigInt(result.rowsAffected), insertId: result.lastInsertRowid };
  }
  const rows = result.rows.map((row) => {
    const record: Record<string, unknown> = {};
    columns.forEach((name, index) => {
      const value = row[index];
      record[name] = value instanceof ArrayBuffer ? Buffer.from(value) : value;
    });
    return record;
  });
  return { rows: rows as R[] };
}
