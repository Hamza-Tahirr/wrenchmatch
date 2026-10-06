// The libSQL driver the app uses with Turso (src/server/db/libsql.ts), on a local `file:` URL:
// writeTx as one write transaction, its misuse guards, foreign keys, result shapes that match
// better-sqlite3's, and mapDbError for libSQL's error shapes (local, and as Turso sends them).
// The whole integration suite can also run on this driver: npm run test:libsql.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { sql, type Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLibsqlKysely, SqliteError } from "@/server/db/libsql";
import { migrate } from "@/server/db/migrate";
import type { DB } from "@/server/db/schema.generated";
import { openSqlite } from "@/server/db/sqlite";
import { writeTx } from "@/server/db/tx";
import { mapDbError, readSqliteFailure } from "@/server/errors";
import { newId } from "@/server/ids";
import { removeTestDirectory } from "../support/db";

let dir: string;
let url: string;
let handles: Kysely<DB>[];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "wrenchmatch-libsql-"));
  const file = path.join(dir, "app.db");
  const sqlite = openSqlite(file);
  try {
    migrate(sqlite);
  } finally {
    sqlite.close();
  }
  url = pathToFileURL(file).href;
  handles = [];
});

afterEach(async () => {
  for (const db of handles) await db.destroy();
  await removeTestDirectory(dir);
});

function open(busyTimeoutMs = 200): Kysely<DB> {
  const db = createLibsqlKysely({ url, busyTimeoutMs });
  handles.push(db);
  return db;
}

async function insertUser(db: Kysely<DB>, email = `${newId()}@example.com`): Promise<string> {
  const id = newId();
  await db
    .insertInto("users")
    .values({ id, email, password_hash: "x", role: "customer", display_name: "Test" })
    .execute();
  return id;
}

const countRows = async (db: Kysely<DB>, table: "users" | "notifications" | "rate_limits") =>
  Number((await sql<{ n: number }>`SELECT count(*) AS n FROM ${sql.table(table)}`.execute(db)).rows[0]?.n);

describe("writeTx on libSQL", () => {
  it("commits, and rolls back everything when the callback fails, mapping trigger errors", async () => {
    const db = open();
    const id = await insertUser(db);
    expect(await writeTx(db, async (trx) => {
      await trx.insertInto("notifications").values({ id: newId(), user_id: id, type: "test", title: "Kept", body: "Kept" }).execute();
      return "done";
    })).toBe("done");

    await expect(
      writeTx(db, async (trx) => {
        await trx.insertInto("notifications").values({ id: newId(), user_id: id, type: "test", title: "Gone", body: "Gone" }).execute();
        await trx.updateTable("users").set({ role: "admin" }).where("id", "=", id).execute();
      }),
    ).rejects.toMatchObject({ name: "DomainError", code: "forbidden", details: { dbReason: "role_immutable" } });
    expect(await countRows(db, "notifications")).toBe(1);
  });

  it("fails fast when the root handle is used inside, does not nest, and stays usable", async () => {
    const db = open();
    await expect(writeTx(db, () => db.selectFrom("users").select("id").execute())).rejects.toThrow(/inside writeTx/);
    await expect(writeTx(db, (trx) => writeTx(trx, async () => 1))).rejects.toThrow(/does not nest/);
    expect(await db.selectFrom("service_categories").select("id").execute()).toHaveLength(12);
  });

  it("serializes concurrent transactions on one handle (no lost updates)", async () => {
    const db = open();
    await db.insertInto("rate_limits").values({ bucket_key: "k", window_started_at: new Date().toISOString(), attempt_count: 0 }).execute();
    const increment = () =>
      writeTx(db, async (trx) => {
        const row = await trx.selectFrom("rate_limits").select("attempt_count").where("bucket_key", "=", "k").executeTakeFirstOrThrow();
        await new Promise((resolve) => setTimeout(resolve, 2));
        await trx.updateTable("rate_limits").set({ attempt_count: row.attempt_count + 1 }).where("bucket_key", "=", "k").execute();
      });
    await Promise.all(Array.from({ length: 10 }, increment));
    const row = await db.selectFrom("rate_limits").select("attempt_count").where("bucket_key", "=", "k").executeTakeFirstOrThrow();
    expect(row.attempt_count).toBe(10);
  });

  it("takes the write lock at BEGIN, so another client cannot write until it commits", async () => {
    const db = open();
    const other = open(50);
    const row = (key: string) => ({ bucket_key: key, window_started_at: new Date().toISOString(), attempt_count: 1 });
    let release!: () => void;
    const holding = new Promise<void>((resolve) => (release = resolve));
    let signalLocked!: () => void;
    const locked = new Promise<void>((resolve) => (signalLocked = resolve));
    const first = writeTx(db, async (trx) => {
      await trx.selectFrom("rate_limits").select("bucket_key").execute(); // (Turso sends BEGIN with it)
      signalLocked();
      await holding;
      await trx.insertInto("rate_limits").values(row("first")).execute();
    });
    await locked;
    await expect(writeTx(other, (trx) => trx.insertInto("rate_limits").values(row("second")).execute())).rejects.toMatchObject({
      name: "DomainError",
      code: "conflict",
      details: { dbReason: "SQLITE_BUSY" },
    });
    release();
    await first;
    await writeTx(other, (trx) => trx.insertInto("rate_limits").values(row("second")).execute());
    expect(await countRows(db, "rate_limits")).toBe(2);
  });

  it("also runs Kysely's own transaction API as a write transaction", async () => {
    const db = open();
    const id = await db.transaction().execute(async (trx) => insertUser(trx));
    expect(await db.selectFrom("users").select("id").where("id", "=", id).execute()).toHaveLength(1);
  });
});

describe("libSQL connections", () => {
  it("enforce foreign keys and cascade deletes", async () => {
    const db = open();
    await expect(
      db.insertInto("notifications").values({ id: newId(), user_id: "missing", type: "test", title: "x", body: "x" }).execute(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    const id = await insertUser(db);
    await db.insertInto("notifications").values({ id: newId(), user_id: id, type: "test", title: "x", body: "x" }).execute();
    await db.deleteFrom("users").where("id", "=", id).execute();
    expect(await countRows(db, "notifications")).toBe(0);
  });

  it("return results shaped like better-sqlite3's", async () => {
    const db = open();
    const id = await insertUser(db);
    const updated = await db.updateTable("users").set({ display_name: "Renamed" }).where("id", "=", id).executeTakeFirstOrThrow();
    expect(updated.numUpdatedRows).toBe(1n);
    const returned = await db.updateTable("users").set({ display_name: "Again" }).where("id", "=", id).returning(["id", "display_name"]).execute();
    expect(returned).toEqual([{ id, display_name: "Again" }]);
    const numbers = await sql<{ i: number; r: number; n: null; a: number }>`SELECT 7 AS i, 2.5 AS r, NULL AS n, 1 AS a, 2 AS a`.execute(db);
    expect(numbers.rows).toEqual([{ i: 7, r: 2.5, n: null, a: 2 }]); // a repeated name keeps the last value
    const deleted = await db.deleteFrom("users").where("id", "=", id).executeTakeFirstOrThrow();
    expect(deleted.numDeletedRows).toBe(1n);
  });

  it("refuse the values better-sqlite3 refuses, with its message", async () => {
    const db = open();
    await expect(sql`SELECT ${true} AS b`.execute(db)).rejects.toThrow(/can only bind numbers, strings, bigints, buffers, and null/);
    await expect(sql`SELECT ${new Date()} AS d`.execute(db)).rejects.toThrow(/can only bind/);
  });

  it("check the schema with the first query", async () => {
    const empty = createLibsqlKysely({ url: pathToFileURL(path.join(dir, "empty.db")).href });
    handles.push(empty);
    await expect(empty.selectFrom("users").select("id").execute()).rejects.toThrow(/has no schema.*npm run db:push:remote/);
  });
});

describe("libSQL errors", () => {
  it("arrive shaped like better-sqlite3's, and map to DomainErrors", async () => {
    const db = open();
    const email = `${newId()}@example.com`;
    const id = await insertUser(db, email);
    const duplicate = await insertUser(db, email).catch((error: unknown) => error);
    expect(duplicate).toMatchObject({ name: "SqliteError", code: "SQLITE_CONSTRAINT_UNIQUE", message: "UNIQUE constraint failed: users.email" });
    expect(mapDbError(duplicate)).toMatchObject({ code: "conflict", details: { dbReason: "users.email" } });

    const role = await db.updateTable("users").set({ role: "admin" }).where("id", "=", id).execute().catch((error: unknown) => error);
    expect(role).toMatchObject({ name: "SqliteError", code: "SQLITE_CONSTRAINT_TRIGGER", message: "role_immutable" });
    expect(role).toBeInstanceOf(SqliteError);
  });

  // As Turso sends them (checked against the hosted database): the primary code only, no
  // extendedCode, and the code repeated in front of "SQLite error: <message>" inside a batch.
  const turso = (code: string, message: string) => Object.assign(new Error(`${code}: ${code}: SQLite error: ${message}`), { code });

  it("from Turso yield SQLite's own code and message", () => {
    expect(readSqliteFailure(turso("SQLITE_CONSTRAINT", "slot_conflict"))).toEqual({ code: "SQLITE_CONSTRAINT_TRIGGER", message: "slot_conflict" });
    expect(readSqliteFailure(turso("SQLITE_CONSTRAINT", "FOREIGN KEY constraint failed"))).toEqual({
      code: "SQLITE_CONSTRAINT_FOREIGNKEY",
      message: "FOREIGN KEY constraint failed",
    });
    expect(readSqliteFailure(turso("SQLITE_CONSTRAINT", "NOT NULL constraint failed: users.email"))?.code).toBe("SQLITE_CONSTRAINT_NOTNULL");
    expect(readSqliteFailure(turso("SQLITE_CONSTRAINT", "CHECK constraint failed: size_bytes > 0"))?.code).toBe("SQLITE_CONSTRAINT_CHECK");
    expect(readSqliteFailure(Object.assign(new Error("SERVER_ERROR: fetch failed"), { code: "SERVER_ERROR" }))).toBeNull();
  });

  it("maps trigger, unique and busy errors as Turso sends them", () => {
    expect(mapDbError(turso("SQLITE_CONSTRAINT", "role_immutable"))).toMatchObject({ code: "forbidden", details: { dbReason: "role_immutable" } });
    expect(mapDbError(turso("SQLITE_CONSTRAINT", "invalid_quote_transition"))).toMatchObject({ code: "conflict", details: { dbReason: "invalid_quote_transition" } });
    expect(mapDbError(turso("SQLITE_CONSTRAINT", "UNIQUE constraint failed: users.email"))).toMatchObject({ code: "conflict", details: { dbReason: "users.email" } });
    expect(
      mapDbError(turso("SQLITE_BUSY", "interactive transaction was rolled back because the stream was idle for too long; retry the transaction")),
    ).toMatchObject({ code: "conflict", details: { dbReason: "SQLITE_BUSY" } });
  });

  it("rethrows other database errors unchanged", () => {
    const foreignKey = turso("SQLITE_CONSTRAINT", "FOREIGN KEY constraint failed");
    expect(() => mapDbError(foreignKey)).toThrow(foreignKey);
    const unknownUnique = turso("SQLITE_CONSTRAINT", "UNIQUE constraint failed: files.storage_key");
    expect(() => mapDbError(unknownUnique)).toThrow(unknownUnique);
    const network = Object.assign(new Error("SERVER_ERROR: fetch failed"), { code: "SERVER_ERROR" });
    expect(() => mapDbError(network)).toThrow(network);
  });
});
