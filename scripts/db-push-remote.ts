// Copies the local SQLite database to the hosted libSQL database (npm run db:push:remote): from
// DATABASE_PATH (default .data/app.db) to TURSO_DATABASE_URL / TURSO_AUTH_TOKEN, taken from the
// environment or else from .env.vercel (see db-remote-target.ts). A `file:` URL works as well.
//
// Everything on the target is replaced in ONE write transaction, so a push that fails leaves the
// target as it was, and the hosted app never reads a half-copied database:
//   1. drop every app trigger, view, index and table on the target;
//   2. create the tables from the source's sqlite_schema, parents before children;
//   3. insert every row in batches, with each value as stored (64-bit integers, reals, text,
//      BLOBs, NULLs) and each row's rowid, which some lists sort by;
//   4. create indexes, views and triggers after the data, so the copied rows (confirmed
//      bookings, audit history) do not fire the triggers that guard new writes;
//   5. check foreign keys (deferred to the commit, so tables that reference each other can load
//      in any order) and row counts, then commit.
// Then it reads the target back and compares, table by table, the row count and a hash of every
// value, the schema, PRAGMA foreign_key_check and PRAGMA integrity_check. Re-running it makes a
// fresh copy. The source is opened read-only and read in one transaction (a consistent snapshot).
import { isMainModule } from "../src/server/db/script-runtime";

import { createHash } from "node:crypto";
import path from "node:path";

import type { Client, InStatement, InValue, Transaction } from "@libsql/client";
import Database from "better-sqlite3";

import { MISSING_REMOTE_TARGET, readRemoteTarget } from "./db-remote-target";

type SqliteDatabase = Database.Database;

/** A schema object of the app (not SQLite's or libSQL's own). */
type SchemaObject = { type: "table" | "index" | "trigger" | "view"; name: string; tableName: string; sql: string };

type TableCopy = {
  name: string;
  sql: string;
  /** Columns the INSERT names, the rowid first when it is copied explicitly. */
  insertColumns: string[];
  orderBy: string;
  /** Values as stored: bigint, number (REAL), string, Buffer or null. */
  rows: InValue[][];
  bytes: number;
};

/** What the target must hold after a push; verifyCopy() compares against it. */
export type ExpectedCopy = {
  objects: SchemaObject[];
  tables: { name: string; rows: number; hash: string; select: string; bytes: number }[];
};

export type PushResult = {
  expected: ExpectedCopy;
  dropped: { tables: number; indexes: number; triggers: number; views: number };
  created: { tables: number; indexes: number; triggers: number; views: number };
  rows: number;
  batches: number;
  bytes: number;
  /** Milliseconds per step. */
  timings: { read: number; clearAndCreate: number; insert: number; indexesAndTriggers: number; checkAndCommit: number };
};

export type PushOptions = {
  source: SqliteDatabase;
  target: Client;
  log?: (line: string) => void;
  /** Most statements in one request (default 500). */
  batchRows?: number;
  /** About how many bytes of values go into one request (default 1 MiB). */
  batchBytes?: number;
};

// SQLite's and libSQL's internal objects (sqlite_sequence, sqlite_autoindex_*, sqlite_stat1,
// libsql_wasm_func_table, ...) are never dropped, copied or compared.
const appObject = (column: string) =>
  `${column} NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND ${column} NOT LIKE 'libsql\\_%' ESCAPE '\\' AND ${column} NOT LIKE '\\_%' ESCAPE '\\'`;
const SCHEMA_QUERY =
  "SELECT type, name, tbl_name AS tableName, sql FROM sqlite_schema " +
  `WHERE type IN ('table', 'index', 'trigger', 'view') AND sql IS NOT NULL AND ${appObject("name")} ORDER BY rowid`;
const FOREIGN_KEYS_QUERY =
  'SELECT m.name AS child, f."table" AS parent FROM sqlite_schema AS m JOIN pragma_foreign_key_list(m.name) AS f ' +
  `WHERE m.type = 'table' AND ${appObject("m.name")}`;

const quoteName = (name: string) => `"${name.replaceAll('"', '""')}"`;
const quoteText = (text: string) => `'${text.replaceAll("'", "''")}'`;
const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
const since = (start: number) => Math.round(performance.now() - start);
const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

/** Tables ordered parents first; tables in a reference cycle keep their order among themselves. */
export function dependencyOrder(
  tables: readonly string[],
  edges: readonly { child: string; parent: string }[],
): string[] {
  const parents = new Map<string, Set<string>>(tables.map((table) => [table, new Set<string>()]));
  for (const { child, parent } of edges) {
    if (child !== parent && parents.has(parent)) parents.get(child)?.add(parent);
  }
  const ordered: string[] = [];
  const placed = new Set<string>();
  const unplacedParents = (table: string) => [...(parents.get(table) ?? [])].filter((parent) => !placed.has(parent));
  /** True when `start` reaches itself through tables not placed yet, i.e. it is on a cycle. */
  const onCycle = (start: string): boolean => {
    const stack = unplacedParents(start);
    const seen = new Set<string>();
    for (let table = stack.pop(); table !== undefined; table = stack.pop()) {
      if (table === start) return true;
      if (seen.has(table)) continue;
      seen.add(table);
      stack.push(...unplacedParents(table));
    }
    return false;
  };
  while (ordered.length < tables.length) {
    const remaining = tables.filter((table) => !placed.has(table));
    // Nothing ready means a cycle: start it with its first table (in the given order).
    const next =
      remaining.find((table) => unplacedParents(table).length === 0) ?? remaining.find(onCycle) ?? remaining[0];
    ordered.push(next);
    placed.add(next);
  }
  return ordered;
}

/** A value as text that keeps its storage class, for hashing (REAL 5 and INTEGER 5 differ). */
function encodeValue(value: unknown): string {
  if (value === null) return "n";
  if (typeof value === "bigint") return `i${value}`;
  if (typeof value === "number") return `r${Object.is(value, -0) ? "-0" : String(value)}`;
  if (typeof value === "string") return `t${value.length}:${value}`;
  if (value instanceof Uint8Array) return `b${Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("hex")}`;
  if (value instanceof ArrayBuffer) return `b${Buffer.from(value).toString("hex")}`;
  throw new TypeError(`Unexpected ${typeof value} value in a row.`);
}

function hashRows(rows: readonly (readonly unknown[])[]): string {
  const hash = createHash("sha256");
  for (const row of rows) hash.update(`${row.map(encodeValue).join("\u001f")}\u001e`);
  return hash.digest("hex");
}

function valueBytes(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (value instanceof Uint8Array) return value.byteLength;
  return 8;
}

/** The rowid name to copy explicitly, or null (WITHOUT ROWID, INTEGER PRIMARY KEY, or shadowed). */
function explicitRowid(source: SqliteDatabase, table: string, columns: readonly string[]): string | null {
  const listed = source
    .prepare<[string], { wr: number }>("SELECT wr FROM pragma_table_list WHERE schema = 'main' AND name = ?")
    .get(table);
  if (listed?.wr === 1) return null;
  const keys = source.prepare<[string], { type: string }>("SELECT type FROM pragma_table_info(?) WHERE pk > 0").all(table);
  if (keys.length === 1 && keys[0].type.toUpperCase() === "INTEGER") return null; // the key column is the rowid
  const taken = new Set(columns.map((column) => column.toLowerCase()));
  return ["rowid", "_rowid_", "oid"].find((name) => !taken.has(name)) ?? null;
}

function readTable(source: SqliteDatabase, object: SchemaObject): TableCopy {
  if (/^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(object.sql)) {
    throw new Error(`Table ${object.name} is a virtual table; copying those is not supported.`);
  }
  const columns = source
    .prepare<[string], { name: string; hidden: number }>("SELECT name, hidden FROM pragma_table_xinfo(?) ORDER BY cid")
    .all(object.name)
    .filter((column) => column.hidden === 0) // generated columns cannot be inserted
    .map((column) => column.name);
  const rowid = explicitRowid(source, object.name, columns);
  const keys = source
    .prepare<[string], { name: string }>("SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk")
    .all(object.name)
    .map((key) => quoteName(key.name));
  const insertColumns = [...(rowid ? [rowid] : []), ...columns.map(quoteName)];
  const orderBy = rowid ?? (keys.length > 0 ? keys.join(", ") : "rowid");
  // safeIntegers: every INTEGER arrives as a bigint (64-bit exact), every REAL as a number.
  const rows = source
    .prepare(`SELECT ${insertColumns.join(", ")} FROM ${quoteName(object.name)} ORDER BY ${orderBy}`)
    .safeIntegers(true)
    .raw(true)
    .all() as InValue[][];
  const bytes = rows.reduce((sum, row) => sum + row.reduce<number>((rowSum, value) => rowSum + valueBytes(value), 0), 0);
  return { name: object.name, sql: object.sql, insertColumns, orderBy, rows, bytes };
}

function readSource(source: SqliteDatabase): { objects: SchemaObject[]; tables: TableCopy[] } {
  // One read transaction: every table comes from the same moment, even if the app is writing.
  return source.transaction(() => {
    const objects = source.prepare<[], SchemaObject>(SCHEMA_QUERY).all();
    const tableObjects = new Map(objects.filter((object) => object.type === "table").map((table) => [table.name, table]));
    const edges = source.prepare<[], { child: string; parent: string }>(FOREIGN_KEYS_QUERY).all();
    const tables = dependencyOrder([...tableObjects.keys()], edges).map((name) => {
      const object = tableObjects.get(name);
      if (!object) throw new Error(`Table ${name} is missing from the source schema.`);
      return readTable(source, object);
    });
    return { objects, tables };
  })();
}

function statementBytes(statement: InStatement): number {
  if (typeof statement === "string") return statement.length;
  const args = Array.isArray(statement.args) ? statement.args : [];
  return statement.sql.length + args.reduce<number>((sum, value) => sum + valueBytes(value), 0);
}

/** Splits statements into requests of at most `maxRows` statements and about `maxBytes` bytes. */
function toBatches(statements: readonly InStatement[], maxRows: number, maxBytes: number): InStatement[][] {
  const batches: InStatement[][] = [];
  let current: InStatement[] = [];
  let bytes = 0;
  for (const statement of statements) {
    const size = statementBytes(statement);
    if (current.length > 0 && (current.length >= maxRows || bytes + size > maxBytes)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(statement);
    bytes += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function rollbackQuietly(transaction: Transaction): Promise<void> {
  try {
    await transaction.rollback();
  } catch {
    // The transaction is gone already (e.g. the connection dropped); nothing was committed.
  }
}

/** Replaces everything on `target` with a copy of `source` (see the top of this file). */
export async function pushDatabase(options: PushOptions): Promise<PushResult> {
  const { source, target, log = () => undefined } = options;
  let started = performance.now();
  const { objects, tables } = readSource(source);
  const indexes = objects.filter((object) => object.type === "index");
  const views = objects.filter((object) => object.type === "view");
  const triggers = objects.filter((object) => object.type === "trigger");
  const rows = tables.reduce((sum, table) => sum + table.rows.length, 0);
  const bytes = tables.reduce((sum, table) => sum + table.bytes, 0);
  const expected: ExpectedCopy = {
    objects,
    tables: tables.map((table) => ({
      name: table.name,
      rows: table.rows.length,
      hash: hashRows(table.rows),
      select: `SELECT ${table.insertColumns.join(", ")} FROM ${quoteName(table.name)} ORDER BY ${table.orderBy}`,
      bytes: table.bytes,
    })),
  };
  const read = since(started);
  log(
    `  Read ${plural(tables.length, "table")} with ${plural(rows, "row")} (${megabytes(bytes)}), ` +
      `${plural(indexes.length, "index", "indexes")}, ${plural(triggers.length, "trigger")} and ${plural(views.length, "view")} in ${read} ms.`,
  );

  const transaction = await target.transaction("write");
  try {
    started = performance.now();
    // Foreign keys are checked at COMMIT instead of per statement: tables that reference each
    // other (users and files) load in any order, and dropping a parent first is no violation.
    const [, existing, existingEdges] = await transaction.batch([
      "PRAGMA defer_foreign_keys = ON",
      SCHEMA_QUERY,
      FOREIGN_KEYS_QUERY,
    ]);
    const present = existing.rows.map((row) => ({ type: String(row.type), name: String(row.name) }));
    const named = (type: string) => present.filter((object) => object.type === type).map((object) => object.name);
    const edges = existingEdges.rows.map((row) => ({ child: String(row.child), parent: String(row.parent) }));
    const dropped = {
      tables: named("table").length,
      indexes: named("index").length,
      triggers: named("trigger").length,
      views: named("view").length,
    };
    await transaction.batch([
      // Triggers first, so the deletes that DROP TABLE implies cannot fire them; children first.
      ...named("trigger").map((name) => `DROP TRIGGER IF EXISTS ${quoteName(name)}`),
      ...named("view").map((name) => `DROP VIEW IF EXISTS ${quoteName(name)}`),
      ...named("index").map((name) => `DROP INDEX IF EXISTS ${quoteName(name)}`),
      ...dependencyOrder(named("table"), edges).reverse().map((name) => `DROP TABLE IF EXISTS ${quoteName(name)}`),
      ...tables.map((table) => table.sql),
    ]);
    const clearAndCreate = since(started);
    log(
      `  Cleared the target (${plural(dropped.tables, "table")}, ${plural(dropped.indexes, "index", "indexes")}, ` +
        `${plural(dropped.triggers, "trigger")}, ${plural(dropped.views, "view")}) and created ${plural(tables.length, "table")} in ${clearAndCreate} ms.`,
    );

    started = performance.now();
    const inserts = tables.flatMap((table) => {
      const sql =
        `INSERT INTO ${quoteName(table.name)} (${table.insertColumns.join(", ")}) ` +
        `VALUES (${table.insertColumns.map(() => "?").join(", ")})`;
      return table.rows.map((args): InStatement => ({ sql, args }));
    });
    const batches = toBatches(inserts, options.batchRows ?? 500, options.batchBytes ?? 1024 * 1024);
    for (const [index, batch] of batches.entries()) {
      await transaction.batch(batch);
      if (batches.length > 1) log(`    batch ${index + 1} of ${batches.length}: ${plural(batch.length, "row")}`);
    }
    const insert = since(started);
    log(`  Inserted ${plural(rows, "row")} in ${plural(batches.length, "batch", "batches")} in ${insert} ms.`);

    started = performance.now();
    await transaction.batch([...indexes, ...views, ...triggers].map((object) => object.sql));
    const indexesAndTriggers = since(started);
    log(
      `  Created ${plural(indexes.length, "index", "indexes")}, ${plural(views.length, "view")} and ` +
        `${plural(triggers.length, "trigger")} in ${indexesAndTriggers} ms.`,
    );

    started = performance.now();
    const countQuery =
      tables.length > 0
        ? tables.map((table) => `SELECT ${quoteText(table.name)} AS name, count(*) AS n FROM ${quoteName(table.name)}`).join(" UNION ALL ")
        : "SELECT NULL AS name, 0 AS n WHERE 0";
    const [violations, counts] = await transaction.batch(["PRAGMA foreign_key_check", countQuery]);
    if (violations.rows.length > 0) {
      const first = violations.rows
        .slice(0, 5)
        .map((row) => `${String(row.table)} row ${String(row.rowid)} -> ${String(row.parent)}`);
      throw new Error(
        `The copy has ${plural(violations.rows.length, "foreign key violation")} (first: ${first.join("; ")}); ` +
          "nothing was changed on the target.",
      );
    }
    const copied = new Map(counts.rows.map((row) => [String(row.name), Number(row.n)]));
    const wrong = tables.filter((table) => copied.get(table.name) !== table.rows.length);
    if (wrong.length > 0) {
      const details = wrong.map((table) => `${table.name}: ${copied.get(table.name)} of ${table.rows.length}`);
      throw new Error(`Row counts differ in the copy (${details.join(", ")}); nothing was changed on the target.`);
    }
    await transaction.commit();
    const checkAndCommit = since(started);
    log(`  Checked foreign keys and row counts, and committed, in ${checkAndCommit} ms.`);

    return {
      expected,
      dropped,
      created: { tables: tables.length, indexes: indexes.length, triggers: triggers.length, views: views.length },
      rows,
      batches: batches.length,
      bytes,
      timings: { read, clearAndCreate, insert, indexesAndTriggers, checkAndCommit },
    };
  } catch (error) {
    await rollbackQuietly(transaction);
    throw error;
  } finally {
    transaction.close();
  }
}

export type VerifyResult = {
  ok: boolean;
  problems: string[];
  tables: { name: string; rows: number; sameContent: boolean }[];
  foreignKeyViolations: number;
  integrity: string;
  ms: number;
};

/**
 * Reads the target back and compares it with what pushDatabase() copied. The target client must
 * use intMode "bigint", so that integers and reals stay apart as they do in the source.
 */
export async function verifyCopy(target: Client, expected: ExpectedCopy): Promise<VerifyResult> {
  const started = performance.now();
  const problems: string[] = [];

  const describe = (object: Record<string, unknown>) =>
    `${String(object.type)} ${String(object.name)} on ${String(object.tableName)}: ${String(object.sql)}`;
  const want = new Set(expected.objects.map(describe));
  const have = new Set((await target.execute(SCHEMA_QUERY)).rows.map((row) => describe(row)));
  for (const object of want) if (!have.has(object)) problems.push(`missing or different on the target: ${object.slice(0, 160)}`);
  for (const object of have) if (!want.has(object)) problems.push(`not in the source: ${object.slice(0, 160)}`);

  // Read the tables back in requests of a few MB each.
  const tables: VerifyResult["tables"] = [];
  const groups: ExpectedCopy["tables"][] = [];
  let groupBytes = 0;
  for (const table of expected.tables) {
    const last = groups.at(-1);
    if (last && groupBytes + table.bytes <= 4 * 1024 * 1024) {
      last.push(table);
      groupBytes += table.bytes;
    } else {
      groups.push([table]);
      groupBytes = table.bytes;
    }
  }
  for (const group of groups) {
    const results = await target.batch(group.map((table) => table.select), "deferred");
    group.forEach((table, index) => {
      const result = results[index];
      const rows = result.rows.map((row) => result.columns.map((_, column) => row[column]));
      const sameContent = rows.length === table.rows && hashRows(rows) === table.hash;
      tables.push({ name: table.name, rows: rows.length, sameContent });
      if (rows.length !== table.rows) problems.push(`${table.name}: ${rows.length} rows on the target, ${table.rows} in the source`);
      else if (!sameContent) problems.push(`${table.name}: values differ from the source`);
    });
  }

  const [violations, integrity] = await target.batch(["PRAGMA foreign_key_check", "PRAGMA integrity_check"], "deferred");
  const integrityText = integrity.rows.map((row) => String(row[0])).join("; ");
  if (violations.rows.length > 0) problems.push(`${plural(violations.rows.length, "foreign key violation")} on the target`);
  if (integrityText !== "ok") problems.push(`integrity_check: ${integrityText.slice(0, 200)}`);

  return { ok: problems.length === 0, problems, tables, foreignKeyViolations: violations.rows.length, integrity: integrityText, ms: since(started) };
}

/** The local path of a `file:` URL, for comparing it with DATABASE_PATH. */
function localPathOf(url: string): string {
  let rest = decodeURIComponent(url.trim().replace(/^file:/i, "").replace(/[?#].*$/, ""));
  rest = rest.replace(/^\/\/(localhost)?(?=\/)/i, "");
  if (process.platform === "win32") rest = rest.replace(/^\/([A-Za-z]:)/, "$1");
  return path.resolve(rest);
}

function samePath(a: string, b: string): boolean {
  const normalize = (file: string) => (process.platform === "win32" ? path.resolve(file).toLowerCase() : path.resolve(file));
  return normalize(a) === normalize(b);
}

async function main(): Promise<void> {
  const { DATABASE_PATH } = await import("../src/server/config");
  const { describeLibsqlUrl, isLocalLibsqlUrl, openLibsqlClient } = await import("../src/server/db/libsql");
  const { listMigrationFiles } = await import("../src/server/db/migrate");

  const remote = readRemoteTarget();
  if (!remote) throw new Error(MISSING_REMOTE_TARGET);
  if (isLocalLibsqlUrl(remote.url) && samePath(localPathOf(remote.url), DATABASE_PATH)) {
    throw new Error("The target is the source file itself; point TURSO_DATABASE_URL at another database.");
  }

  const display = path.relative(process.cwd(), DATABASE_PATH) || DATABASE_PATH;
  console.log(`Copying ${display} to ${describeLibsqlUrl(remote.url)} (settings from ${remote.source}).`);
  console.log("Everything on the target is replaced, in one transaction.");

  const source = new Database(DATABASE_PATH, { readonly: true, fileMustExist: true });
  try {
    const applied = new Set(
      source
        .prepare<[], { version: string }>("SELECT version FROM schema_migrations")
        .all()
        .map((row) => row.version),
    );
    const missing = listMigrationFiles().filter((migration) => !applied.has(migration.version));
    if (missing.length > 0) {
      const versions = missing.map((migration) => migration.version).join(", ");
      throw new Error(`${display} is missing migrations (${versions}); run "npm run db:migrate" or "npm run db:reset" first.`);
    }

    const started = performance.now();
    const target = await openLibsqlClient({ url: remote.url, authToken: remote.authToken }, { intMode: "bigint" });
    try {
      const pushed = await pushDatabase({ source, target, log: (line) => console.log(line) });
      console.log("Verifying the copy ...");
      const verified = await verifyCopy(target, pushed.expected);
      const width = Math.max(5, ...verified.tables.map((table) => table.name.length));
      for (const table of verified.tables) {
        console.log(`  ${table.name.padEnd(width)} ${String(table.rows).padStart(6)} rows  ${table.sameContent ? "same" : "DIFFERENT"}`);
      }
      const foreignKeys = verified.foreignKeyViolations === 0 ? "ok" : `${verified.foreignKeyViolations} violation(s)`;
      console.log(`  foreign_key_check: ${foreignKeys}; integrity_check: ${verified.integrity}; read back in ${verified.ms} ms.`);
      if (!verified.ok) {
        for (const problem of verified.problems) console.error(`  PROBLEM: ${problem}`);
        throw new Error("The copy on the target does not match the source (see above).");
      }
      console.log(
        `Done in ${((performance.now() - started) / 1000).toFixed(1)} s: ${plural(pushed.rows, "row")} in ` +
          `${plural(pushed.created.tables, "table")}, ${plural(pushed.created.indexes, "index", "indexes")} and ` +
          `${plural(pushed.created.triggers, "trigger")}; the target matches the source.`,
      );
    } finally {
      target.close();
    }
  } finally {
    source.close();
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
