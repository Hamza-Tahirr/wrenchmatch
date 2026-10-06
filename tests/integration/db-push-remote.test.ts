// npm run db:push:remote (scripts/db-push-remote.ts): copying the local database to a libSQL
// database in one transaction, here a `file:` URL standing in for Turso.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openLibsqlClient } from "@/server/db/libsql";
import { newId } from "@/server/ids";
import { dependencyOrder, pushDatabase, verifyCopy } from "../../scripts/db-push-remote";
import { createTestContext, rejectionOf, removeTestDirectory, type TestContext } from "../support/db";
import { createDemoFixtureBooking, createMechanic, createOpenRequest, createUser } from "../support/factories";

let source: TestContext;
let targetDir: string;
let target: Client;

beforeEach(async () => {
  source = createTestContext();
  targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "wrenchmatch-push-"));
  const url = pathToFileURL(path.join(targetDir, "hosted.db")).href;
  target = await openLibsqlClient({ url }, { intMode: "bigint" });
});

afterEach(async () => {
  target.close();
  await source.cleanup();
  await removeTestDirectory(targetDir);
});

/** App rows a push must carry: a confirmed fixture booking, and users and files that reference each other. */
async function addSampleData(): Promise<{ customerId: string }> {
  const customer = await createUser(source.ctx, { role: "customer" });
  const mechanic = await createMechanic(source.ctx);
  await createOpenRequest(source.ctx, customer);
  await createDemoFixtureBooking(source.ctx, { customer, mechanic });
  const fileId = newId();
  source.sqlite
    .prepare(
      "INSERT INTO files (id, owner_user_id, purpose, storage_key, mime_type, size_bytes, width, height, sha256, metadata_stripped) " +
        "VALUES (?, ?, 'user_avatar', ?, 'image/jpeg', 2048, 256, 256, ?, 1)",
    )
    .run(fileId, customer.id, `user-avatars/2026/${fileId}.jpg`, "f".repeat(64));
  source.sqlite.prepare("UPDATE users SET avatar_file_id = ? WHERE id = ?").run(fileId, customer.id);
  return { customerId: customer.id };
}

const sourceCount = (sqlText: string) => (source.sqlite.prepare(sqlText).get() as { n: number }).n;
const targetRows = async (sqlText: string) => (await target.execute(sqlText)).rows.map((row) => ({ ...row }));

describe("pushDatabase", () => {
  it("copies every table, row, index and trigger, and the copy checks out", async () => {
    const { customerId } = await addSampleData();
    const pushed = await pushDatabase({ source: source.sqlite, target, batchRows: 10 });

    const tables = source.sqlite
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    const rows = tables.reduce((sum, table) => sum + sourceCount(`SELECT count(*) AS n FROM "${table.name}"`), 0);
    expect(pushed.created.tables).toBe(tables.length);
    expect(pushed.rows).toBe(rows);
    expect(pushed.batches).toBeGreaterThan(1);
    expect(pushed.created.triggers).toBe(sourceCount("SELECT count(*) AS n FROM sqlite_schema WHERE type = 'trigger'"));
    expect(pushed.created.indexes).toBe(sourceCount("SELECT count(*) AS n FROM sqlite_schema WHERE type = 'index' AND sql IS NOT NULL"));

    const verified = await verifyCopy(target, pushed.expected);
    expect(verified.problems).toEqual([]);
    expect(verified).toMatchObject({ ok: true, foreignKeyViolations: 0, integrity: "ok" });

    // rowids come along (some lists sort by them)
    const sourceRowids = source.sqlite.prepare("SELECT rowid AS r, id FROM users ORDER BY rowid").all() as { r: number; id: string }[];
    const copiedRowids = (await targetRows("SELECT rowid AS r, id FROM users ORDER BY rowid")).map((row) => ({ r: Number(row.r), id: row.id }));
    expect(copiedRowids).toEqual(sourceRowids);

    // the triggers and foreign keys guard new writes on the copy
    const roleChange = rejectionOf(target.execute({ sql: "UPDATE users SET role = 'admin' WHERE id = ?", args: [customerId] }));
    expect((await roleChange).message).toMatch(/role_immutable/);
    const orphan = rejectionOf(
      target.execute("INSERT INTO notifications (id, user_id, type, title, body) VALUES ('n1', 'missing', 't', 't', 't')"),
    );
    expect((await orphan).message).toMatch(/FOREIGN KEY/);
  });

  it("replaces whatever the target had, so pushing again makes a fresh copy", async () => {
    await addSampleData();
    const first = await pushDatabase({ source: source.sqlite, target });
    await target.executeMultiple(`
      DELETE FROM notifications;
      CREATE TABLE leftover (x TEXT);
      INSERT INTO leftover VALUES ('old');
      CREATE INDEX leftover_x ON leftover(x);
      CREATE TRIGGER leftover_guard BEFORE DELETE ON leftover BEGIN SELECT RAISE(ABORT, 'keep'); END;
    `);
    await createUser(source.ctx, { role: "customer" });

    const second = await pushDatabase({ source: source.sqlite, target });
    expect(second.dropped.tables).toBe(first.created.tables + 1);
    expect(second.rows).toBe(first.rows + 1);
    expect((await verifyCopy(target, second.expected)).problems).toEqual([]);
    expect(await targetRows("SELECT name FROM sqlite_schema WHERE name LIKE 'leftover%'")).toEqual([]);
  });

  it("keeps every value as stored: 64-bit integers, reals, text, BLOBs, NULLs and rowids", async () => {
    source.sqlite.exec(`
      CREATE TABLE fidelity (v);
      INSERT INTO fidelity (rowid, v) VALUES (1, 9007199254740993), (2, 5.0), (3, -1.5e-7), (4, 1e308), (5, 'text; with ''quotes'''),
        (6, ''), (7, x'00ff10'), (8, zeroblob(0)), (9, NULL), (4611686018427387904, 42);
      CREATE TABLE keyed (id INTEGER PRIMARY KEY, label TEXT NOT NULL);
      INSERT INTO keyed VALUES (1, 'one'), (10, 'ten'), (1099511627776, 'big');
      CREATE TABLE no_rowid (k TEXT PRIMARY KEY, n INTEGER) WITHOUT ROWID;
      INSERT INTO no_rowid VALUES ('b', 2), ('a', 1);
    `);
    const pushed = await pushDatabase({ source: source.sqlite, target });
    expect((await verifyCopy(target, pushed.expected)).problems).toEqual([]);

    const describe = "SELECT rowid AS r, typeof(v) AS t, CASE WHEN typeof(v) = 'blob' THEN hex(v) ELSE v END AS v FROM fidelity ORDER BY rowid";
    const expected = (source.sqlite.prepare(describe).safeIntegers(true).all() as Record<string, unknown>[]).map((row) => ({ ...row }));
    expect(await targetRows(describe)).toEqual(expected);
    expect(await targetRows("SELECT id, label FROM keyed ORDER BY id")).toEqual([
      { id: 1n, label: "one" },
      { id: 10n, label: "ten" },
      { id: 1099511627776n, label: "big" },
    ]);
    expect(await targetRows("SELECT k, n FROM no_rowid ORDER BY k")).toEqual([{ k: "a", n: 1n }, { k: "b", n: 2n }]);
  });

  it("leaves the target as it was when the copy fails", async () => {
    await addSampleData();
    const first = await pushDatabase({ source: source.sqlite, target });

    source.sqlite.pragma("foreign_keys = OFF");
    source.sqlite.prepare("INSERT INTO notifications (id, user_id, type, title, body) VALUES (?, 'missing', 't', 't', 't')").run(newId());
    source.sqlite.pragma("foreign_keys = ON");
    const failure = await rejectionOf(pushDatabase({ source: source.sqlite, target }));
    expect(failure.message).toMatch(/foreign key violation.*nothing was changed/);

    expect((await verifyCopy(target, first.expected)).problems).toEqual([]);
  });
});

describe("dependencyOrder", () => {
  it("puts parents before children, ignoring self references and unknown tables", () => {
    const edges = [
      { child: "c", parent: "b" },
      { child: "b", parent: "a" },
      { child: "a", parent: "a" },
      { child: "b", parent: "elsewhere" },
    ];
    expect(dependencyOrder(["c", "b", "a"], edges)).toEqual(["a", "b", "c"]);
  });

  it("keeps tables that reference each other in their own order", () => {
    const edges = [
      { child: "files", parent: "users" },
      { child: "users", parent: "files" },
      { child: "photos", parent: "files" },
    ];
    expect(dependencyOrder(["photos", "users", "files"], edges)).toEqual(["users", "files", "photos"]);
  });
});
