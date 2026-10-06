// Database bootstrap: migrations (better-sqlite3 and libSQL runners), generated types, connection
// pragmas, getDb() on both drivers and the local file storage the app context is built on.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { Client } from "@libsql/client";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppContext } from "@/server/context";
import { openLibsqlClient } from "@/server/db/libsql";
import {
  DEFAULT_MIGRATIONS_DIR,
  FOREIGN_KEYS_OFF_DIRECTIVE,
  getAppliedVersions,
  getAppliedVersionsOnLibsql,
  listMigrationFiles,
  migrate,
  migrateOnLibsql,
} from "@/server/db/migrate";
import { isSameGeneratedSource, renderSchemaTypes } from "@/server/db/schema-types";
import { closeKysely, createKysely, openSqlite } from "@/server/db/sqlite";
import { writeTx } from "@/server/db/tx";
import { newId } from "@/server/ids";
import { createLocalFileStorage, InvalidStorageKeyError } from "@/server/storage/local-storage";
import { prepareUpload, saveFile, UPLOAD_FOLDERS } from "@/server/storage/uploads";
import { removeUploadFolders } from "../../scripts/reset-uploads";
import { createTestContext, DEFAULT_TEST_NOW, rejectionOf, removeTestDirectory } from "../support/db";
import { createMechanic, createOpenRequest, createUser } from "../support/factories";

let dir: string;
let libsqlClients: Client[] = [];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "wrenchmatch-migrate-"));
});

afterEach(async () => {
  for (const client of libsqlClients) client.close();
  libsqlClients = [];
  await removeTestDirectory(dir);
});

function withDatabase<T>(file: string, run: (sqlite: Database.Database) => T): T {
  const sqlite = openSqlite(path.join(dir, file));
  try {
    return run(sqlite);
  } finally {
    sqlite.close();
  }
}

/** A libSQL client on a file in the test directory (closed after the test). */
async function libsqlClient(file: string): Promise<Client> {
  const client = await openLibsqlClient({ url: pathToFileURL(path.join(dir, file)).href });
  libsqlClients.push(client);
  return client;
}

async function libsqlCount(client: Client, table: string): Promise<number> {
  return Number((await client.execute(`SELECT count(*) AS n FROM ${table}`)).rows[0]?.n);
}

// A table other tables reference, and a migration that rebuilds it with SQLite's 12-step
// procedure (widening parent.kind's CHECK).
const SETUP = [
  "CREATE TABLE parent (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('a'))) STRICT;",
  "CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parent(id) ON DELETE CASCADE) STRICT;",
  "INSERT INTO parent VALUES ('p1', 'a');",
  "INSERT INTO child VALUES ('c1', 'p1');",
].join("\n");
const rebuild = (copyWhere = "1 = 1") =>
  [
    "CREATE TABLE parent_new (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('a', 'b'))) STRICT;",
    `INSERT INTO parent_new (id, kind) SELECT id, kind FROM parent WHERE ${copyWhere};`,
    "DROP TABLE parent;",
    "ALTER TABLE parent_new RENAME TO parent;",
  ].join("\n");

function migrationsWith(second: string): string {
  const migrations = path.join(dir, "migrations");
  fs.mkdirSync(migrations, { recursive: true });
  fs.writeFileSync(path.join(migrations, "0001_setup.sql"), SETUP);
  fs.writeFileSync(path.join(migrations, "0002_rebuild.sql"), second);
  return migrations;
}

describe("migrate", () => {
  it("applies every migration once and is idempotent", () => {
    const versions = listMigrationFiles().map((m) => m.version);
    expect(versions[0]).toBe("0001_init");

    withDatabase("app.db", (sqlite) => {
      expect(migrate(sqlite)).toEqual(versions);
      expect(migrate(sqlite)).toEqual([]);
      expect(getAppliedVersions(sqlite)).toEqual(versions);
      const rows = sqlite.prepare("SELECT version, applied_at FROM schema_migrations").all() as {
        version: string;
        applied_at: string;
      }[];
      expect(rows).toHaveLength(versions.length);
      for (const row of rows) expect(row.applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    // a fresh connection to the same file sees nothing pending
    withDatabase("app.db", (sqlite) => expect(migrate(sqlite)).toEqual([]));
  });

  it("seeds the 12 service categories, two of them safety-sensitive", () => {
    withDatabase("app.db", (sqlite) => {
      migrate(sqlite);
      const categories = sqlite
        .prepare("SELECT id, safety_sensitive, enabled FROM service_categories ORDER BY sort_order")
        .all() as { id: string; safety_sensitive: number; enabled: number }[];
      expect(categories).toHaveLength(12);
      expect(categories.filter((c) => c.safety_sensitive === 1).map((c) => c.id)).toEqual([
        "brake_work",
        "suspension_work",
      ]);
      expect(categories.every((c) => c.enabled === 1)).toBe(true);
    });
  });

  it("applies only new files on a later run, in lexical order", () => {
    const migrations = path.join(dir, "migrations");
    fs.mkdirSync(migrations);
    fs.writeFileSync(path.join(migrations, "0002_second.sql"), "CREATE TABLE second (id TEXT PRIMARY KEY) STRICT;");
    fs.writeFileSync(path.join(migrations, "0001_first.sql"), "CREATE TABLE first (id TEXT PRIMARY KEY) STRICT;");
    fs.writeFileSync(path.join(migrations, "README.md"), "not a migration");

    withDatabase("custom.db", (sqlite) => {
      expect(migrate(sqlite, migrations)).toEqual(["0001_first", "0002_second"]);
      fs.writeFileSync(
        path.join(migrations, "0003_third.sql"),
        "ALTER TABLE second ADD COLUMN label TEXT;",
      );
      expect(migrate(sqlite, migrations)).toEqual(["0003_third"]);
      expect(migrate(sqlite, migrations)).toEqual([]);
    });
  });

  it("refuses badly named migration files instead of skipping them", () => {
    const migrations = path.join(dir, "migrations");
    fs.mkdirSync(migrations);
    fs.writeFileSync(path.join(migrations, "0001_first.sql"), "CREATE TABLE first (id TEXT PRIMARY KEY) STRICT;");
    fs.writeFileSync(path.join(migrations, "add_widgets.sql"), "CREATE TABLE widgets (id TEXT PRIMARY KEY) STRICT;");
    withDatabase("named.db", (sqlite) => {
      expect(() => migrate(sqlite, migrations)).toThrow(/add_widgets\.sql.*NNNN_description\.sql/);
      expect(getAppliedVersions(sqlite)).toEqual([]);
    });
  });

  it("rolls back a failing migration completely", () => {
    const migrations = path.join(dir, "migrations");
    fs.mkdirSync(migrations);
    fs.writeFileSync(path.join(migrations, "0001_ok.sql"), "CREATE TABLE ok (id TEXT PRIMARY KEY) STRICT;");
    fs.writeFileSync(
      path.join(migrations, "0002_broken.sql"),
      "CREATE TABLE half_done (id TEXT PRIMARY KEY) STRICT;\nCREATE TABLE ok (id TEXT);",
    );

    withDatabase("broken.db", (sqlite) => {
      expect(() => migrate(sqlite, migrations)).toThrow(/already exists/);
      expect(getAppliedVersions(sqlite)).toEqual(["0001_ok"]);
      const tables = sqlite
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'half_done'")
        .all();
      expect(tables).toEqual([]);
      expect(sqlite.inTransaction).toBe(false);
    });
  });
});

describe("migrations that rebuild a referenced table (foreign keys off)", () => {
  const count = (sqlite: Database.Database, table: string) =>
    (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

  it("rebuilds without cascading when the first line asks for it, then turns foreign keys back on", () => {
    const migrations = migrationsWith(`${FOREIGN_KEYS_OFF_DIRECTIVE}\n-- widen parent.kind\n${rebuild()}`);
    withDatabase("fk-off.db", (sqlite) => {
      expect(migrate(sqlite, migrations)).toEqual(["0001_setup", "0002_rebuild"]);
      expect(count(sqlite, "child")).toBe(1);
      expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      sqlite.prepare("INSERT INTO parent VALUES ('p2', 'b')").run();
      // the child's foreign key now points at the rebuilt table and is enforced
      expect(() => sqlite.prepare("INSERT INTO child VALUES ('c2', 'missing')").run()).toThrow(/FOREIGN KEY/);
      sqlite.prepare("DELETE FROM parent WHERE id = 'p1'").run();
      expect(count(sqlite, "child")).toBe(0);
    });
  });

  it("would cascade into the child rows without the directive (why it exists)", () => {
    const migrations = migrationsWith(rebuild());
    withDatabase("fk-on.db", (sqlite) => {
      migrate(sqlite, migrations);
      expect(count(sqlite, "child")).toBe(0);
    });
  });

  it("rolls back completely when the rebuild leaves dangling references", () => {
    const migrations = migrationsWith(`${FOREIGN_KEYS_OFF_DIRECTIVE}\n${rebuild("kind = 'none'")}`);
    withDatabase("dangling.db", (sqlite) => {
      expect(() => migrate(sqlite, migrations)).toThrow(/0002_rebuild left 1 foreign key violation\(s\).*rolled back/);
      expect(getAppliedVersions(sqlite)).toEqual(["0001_setup"]);
      expect(sqlite.prepare("SELECT id, kind FROM parent").all()).toEqual([{ id: "p1", kind: "a" }]);
      expect(count(sqlite, "child")).toBe(1);
      expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(sqlite.inTransaction).toBe(false);
      expect(sqlite.prepare("SELECT name FROM sqlite_schema WHERE name = 'parent_new'").all()).toEqual([]);
    });
  });

  it("leaves foreign keys off afterwards on a connection that had them off", () => {
    const migrations = migrationsWith(`${FOREIGN_KEYS_OFF_DIRECTIVE}\n${rebuild()}`);
    const sqlite = new Database(path.join(dir, "plain.db"));
    try {
      sqlite.pragma("foreign_keys = OFF"); // better-sqlite3 turns them on by default
      expect(migrate(sqlite, migrations)).toEqual(["0001_setup", "0002_rebuild"]);
      expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(0);
    } finally {
      sqlite.close();
    }
  });

  it("refuses to switch foreign keys off inside an open transaction", () => {
    const migrations = migrationsWith(`${FOREIGN_KEYS_OFF_DIRECTIVE}\n${rebuild()}`);
    withDatabase("open-tx.db", (sqlite) => {
      expect(migrate(sqlite, migrations)).toEqual(["0001_setup", "0002_rebuild"]);
      fs.writeFileSync(path.join(migrations, "0003_again.sql"), `${FOREIGN_KEYS_OFF_DIRECTIVE}\nCREATE TABLE later (id TEXT) STRICT;`);
      sqlite.exec("BEGIN");
      try {
        expect(() => migrate(sqlite, migrations)).toThrow(/0003_again needs foreign keys off.*open transaction/);
      } finally {
        sqlite.exec("ROLLBACK");
      }
      expect(migrate(sqlite, migrations)).toEqual(["0003_again"]);
    });
  });

  it("only treats the directive as such on the first line", () => {
    const migrations = migrationsWith(`-- widen parent.kind\n${FOREIGN_KEYS_OFF_DIRECTIVE}\n${rebuild()}`);
    withDatabase("second-line.db", (sqlite) => {
      migrate(sqlite, migrations);
      expect(count(sqlite, "child")).toBe(0); // ran with foreign keys on, so the drop cascaded
    });
  });
});

describe("migrateOnLibsql (Turso; a file: URL here)", () => {
  const SCHEMA = "SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name";

  it("applies the app's migrations once, building the same schema as migrate()", async () => {
    const versions = listMigrationFiles().map((m) => m.version);
    const client = await libsqlClient("libsql.db");
    expect(await migrateOnLibsql(client)).toEqual(versions);
    expect(await migrateOnLibsql(client)).toEqual([]);
    expect(await getAppliedVersionsOnLibsql(client)).toEqual(versions);

    const reference = withDatabase("reference.db", (sqlite) => {
      migrate(sqlite);
      return sqlite.prepare(SCHEMA).all();
    });
    expect((await client.execute(SCHEMA)).rows.map((row) => ({ ...row }))).toEqual(reference);
    expect(await libsqlCount(client, "service_categories")).toBe(12);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    expect((await client.execute("PRAGMA foreign_keys")).rows[0]?.foreign_keys).toBe(1);
  });

  it("applies only new files, and rolls back a failing one completely", async () => {
    const migrations = path.join(dir, "migrations");
    fs.mkdirSync(migrations);
    fs.writeFileSync(path.join(migrations, "0001_ok.sql"), "CREATE TABLE ok (id TEXT PRIMARY KEY) STRICT;");
    const client = await libsqlClient("broken.db");
    expect(await migrateOnLibsql(client, migrations)).toEqual(["0001_ok"]);

    fs.writeFileSync(
      path.join(migrations, "0002_broken.sql"),
      "CREATE TABLE half_done (id TEXT PRIMARY KEY) STRICT;\nCREATE TABLE ok (id TEXT);",
    );
    expect((await rejectionOf(migrateOnLibsql(client, migrations))).message).toMatch(/already exists/);
    expect(await getAppliedVersionsOnLibsql(client)).toEqual(["0001_ok"]);
    expect((await client.execute("SELECT name FROM sqlite_schema WHERE name = 'half_done'")).rows).toEqual([]);
  });

  it("applies each file once when two runs race", async () => {
    const [first, second] = [await libsqlClient("race.db"), await libsqlClient("race.db")];
    const [a, b] = await Promise.all([migrateOnLibsql(first), migrateOnLibsql(second)]);
    expect([...a, ...b].sort()).toEqual(listMigrationFiles().map((m) => m.version));
    expect(await libsqlCount(first, "schema_migrations")).toBe(listMigrationFiles().length);
  });

  it("rebuilds without cascading when the first line asks for it, then turns foreign keys back on", async () => {
    const migrations = migrationsWith(`${FOREIGN_KEYS_OFF_DIRECTIVE}\n-- widen parent.kind\n${rebuild()}`);
    const client = await libsqlClient("fk-off.db");
    expect(await migrateOnLibsql(client, migrations)).toEqual(["0001_setup", "0002_rebuild"]);
    expect(await libsqlCount(client, "child")).toBe(1);
    expect((await client.execute("PRAGMA foreign_keys")).rows[0]?.foreign_keys).toBe(1);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    await client.execute("INSERT INTO parent VALUES ('p2', 'b')");
    expect((await rejectionOf(client.execute("INSERT INTO child VALUES ('c2', 'missing')"))).message).toMatch(/FOREIGN KEY/);
    await client.execute("DELETE FROM parent WHERE id = 'p1'");
    expect(await libsqlCount(client, "child")).toBe(0);
  });

  it("would cascade into the child rows without the directive", async () => {
    const client = await libsqlClient("fk-on.db");
    await migrateOnLibsql(client, migrationsWith(rebuild()));
    expect(await libsqlCount(client, "child")).toBe(0);
  });

  it("rolls back completely when the rebuild leaves dangling references", async () => {
    const migrations = migrationsWith(`${FOREIGN_KEYS_OFF_DIRECTIVE}\n${rebuild("kind = 'none'")}`);
    const client = await libsqlClient("dangling.db");
    const failure = await rejectionOf(migrateOnLibsql(client, migrations));
    expect(failure.message).toMatch(/0002_rebuild left foreign key violation\(s\).*rolled back/);
    expect(await getAppliedVersionsOnLibsql(client)).toEqual(["0001_setup"]);
    expect((await client.execute("SELECT id, kind FROM parent")).rows.map((row) => ({ ...row }))).toEqual([{ id: "p1", kind: "a" }]);
    expect(await libsqlCount(client, "child")).toBe(1);
    expect((await client.execute("PRAGMA foreign_keys")).rows[0]?.foreign_keys).toBe(1);
    expect((await client.execute("SELECT name FROM sqlite_schema WHERE name = 'parent_new'")).rows).toEqual([]);
  });
});

describe("0003_media on a database that already has data", () => {
  it("keeps every file, request photo, profile photo and document, and accepts the new purposes", async () => {
    const migrations = path.join(dir, "migrations");
    fs.mkdirSync(migrations);
    const files = listMigrationFiles();
    const media = files.find((file) => file.version === "0003_media");
    expect(media).toBeDefined();
    for (const file of files.filter((candidate) => candidate.version < "0003_media")) {
      fs.copyFileSync(file.filePath, path.join(migrations, path.basename(file.filePath)));
    }

    const sqlite = openSqlite(path.join(dir, "existing.db"));
    const db = createKysely(sqlite);
    const ctx: AppContext = { db, now: new Date(DEFAULT_TEST_NOW), storage: createLocalFileStorage(path.join(dir, "uploads")) };
    try {
      expect(migrate(sqlite, migrations)).toEqual(["0001_init", "0002_support_requests"]);
      const customer = await createUser(ctx, { role: "customer" });
      const mechanic = await createMechanic(ctx);
      const request = await createOpenRequest(ctx, customer);
      const insertFile = (owner: string, purpose: string, mime: string) => {
        const id = newId();
        sqlite
          .prepare(
            "INSERT INTO files (id, owner_user_id, purpose, storage_key, mime_type, size_bytes, sha256, metadata_stripped) VALUES (?, ?, ?, ?, ?, 10, ?, ?)",
          )
          .run(id, owner, purpose, `x/${id}.bin`, mime, "a".repeat(64), mime.startsWith("image/") ? 1 : 0);
        return id;
      };
      const photo = insertFile(customer.id, "request_photo", "image/jpeg");
      sqlite.prepare("INSERT INTO request_media (file_id, request_id, kind, shareable_before_booking) VALUES (?, ?, 'photo', 1)").run(photo, request.id);
      const profilePhoto = insertFile(mechanic.id, "mechanic_profile_photo", "image/jpeg");
      sqlite.prepare("UPDATE mechanic_profiles SET profile_photo_file_id = ? WHERE user_id = ?").run(profilePhoto, mechanic.id);
      const document = insertFile(mechanic.id, "mechanic_document", "application/pdf");
      sqlite
        .prepare("INSERT INTO mechanic_documents (id, mechanic_id, file_id, kind) VALUES (?, ?, ?, 'insurance')")
        .run(newId(), mechanic.id, document);
      const snapshot = (table: string, key: string) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY ${key}`).all();
      const before = {
        files: snapshot("files", "id"),
        media: snapshot("request_media", "file_id"),
        documents: snapshot("mechanic_documents", "id"),
        profiles: snapshot("mechanic_profiles", "user_id"),
      };

      fs.copyFileSync(media!.filePath, path.join(migrations, "0003_media.sql"));
      expect(migrate(sqlite, migrations)).toEqual(["0003_media"]);

      expect(snapshot("files", "id")).toEqual(before.files);
      expect(snapshot("request_media", "file_id")).toEqual(before.media);
      expect(snapshot("mechanic_documents", "id")).toEqual(before.documents);
      expect(snapshot("mechanic_profiles", "user_id")).toEqual(before.profiles);
      expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(sqlite.prepare("SELECT name FROM sqlite_schema WHERE sql LIKE '%files_new%'").all()).toEqual([]);

      const avatar = insertFile(customer.id, "user_avatar", "image/jpeg");
      sqlite.prepare("UPDATE users SET avatar_file_id = ? WHERE id = ?").run(avatar, customer.id);
      insertFile(mechanic.id, "mechanic_gallery", "image/jpeg");
      insertFile(customer.id, "booking_photo", "image/jpeg");
      // the old references still cascade / set null through the rebuilt table
      sqlite.prepare("DELETE FROM files WHERE id = ?").run(photo);
      expect(sqlite.prepare("SELECT count(*) AS n FROM request_media").get()).toEqual({ n: 0 });
      sqlite.prepare("DELETE FROM files WHERE id = ?").run(avatar);
      expect(sqlite.prepare("SELECT avatar_file_id FROM users WHERE id = ?").get(customer.id)).toEqual({ avatar_file_id: null });
    } finally {
      await closeKysely(db, sqlite);
    }
  });
});

describe("generated schema types", () => {
  it("match the migrations (run npm run db:types after changing a migration)", () => {
    const sqlite = new Database(":memory:");
    try {
      migrate(sqlite, DEFAULT_MIGRATIONS_DIR);
      const expected = renderSchemaTypes(sqlite);
      const committed = fs
        .readFileSync(path.join(process.cwd(), "src", "server", "db", "schema.generated.ts"), "utf8")
        .replace(/\r\n/g, "\n");
      expect(committed).toBe(expected);
    } finally {
      sqlite.close();
    }
  });

  it("count as up to date when checked out with CRLF line endings, so db:types leaves the file alone", () => {
    const rendered = "// generated\n\nexport interface DB {\n  users: Users;\n}\n";
    expect(isSameGeneratedSource(rendered.replace(/\n/g, "\r\n"), rendered)).toBe(true);
    expect(isSameGeneratedSource(rendered, rendered)).toBe(true);
    expect(isSameGeneratedSource(rendered.replace("users", "files"), rendered)).toBe(false);
    expect(isSameGeneratedSource(null, rendered)).toBe(false);
  });
});

describe("openSqlite", () => {
  it("sets WAL, foreign keys, busy timeout and synchronous=NORMAL", () => {
    withDatabase("pragmas.db", (sqlite) => {
      expect(sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(sqlite.pragma("busy_timeout", { simple: true })).toBe(5000);
      expect(sqlite.pragma("synchronous", { simple: true })).toBe(1);
    });
  });

  it("can require the file to exist", () => {
    expect(() => openSqlite(path.join(dir, "missing.db"), { fileMustExist: true })).toThrow();
  });
});

describe("getDb", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("tells the developer to run db:reset when the database file is missing", async () => {
    vi.stubEnv("DATABASE_PATH", path.join(dir, "nope", "app.db"));
    vi.resetModules();
    const { getDb } = await import("@/server/db/client");
    expect(() => getDb()).toThrow(/npm run db:reset/);
  });

  it("refuses a database file without the schema (checked with the first query)", async () => {
    const empty = path.join(dir, "empty.db");
    new Database(empty).close();
    vi.stubEnv("DATABASE_PATH", empty);
    vi.resetModules();
    const { closeDb, getDb } = await import("@/server/db/client");
    try {
      await expect(getDb().selectFrom("users").select("id").execute()).rejects.toThrow(/has no schema.*npm run db:reset/);
    } finally {
      await closeDb();
    }
  });

  it("returns one shared handle for a migrated database", async () => {
    const file = path.join(dir, "app.db");
    withDatabase("app.db", (sqlite) => migrate(sqlite));
    vi.stubEnv("DATABASE_PATH", file);
    vi.resetModules();
    const { closeDb, getDb } = await import("@/server/db/client");
    try {
      const db = getDb();
      expect(getDb()).toBe(db);
      const row = await db.selectFrom("service_categories").select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirstOrThrow();
      expect(row.n).toBe(12);
    } finally {
      await closeDb();
    }
  });
});

describe("getDb with TURSO_DATABASE_URL", () => {
  afterEach(() => {
    vi.doUnmock("better-sqlite3");
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses that libSQL database instead of DATABASE_PATH, without loading better-sqlite3", async () => {
    const file = path.join(dir, "hosted.db");
    withDatabase("hosted.db", (sqlite) => migrate(sqlite));
    vi.stubEnv("TURSO_DATABASE_URL", pathToFileURL(file).href);
    vi.stubEnv("DATABASE_PATH", path.join(dir, "missing", "app.db"));
    vi.resetModules();
    vi.doMock("better-sqlite3", () => {
      throw new Error("better-sqlite3 was loaded on the libSQL path");
    });
    const { closeDb, getDb } = await import("@/server/db/client");
    try {
      const db = getDb();
      expect(getDb()).toBe(db);
      const row = await db.selectFrom("service_categories").select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirstOrThrow();
      expect(row.n).toBe(12);
      const updated = await writeTx(db, (trx) =>
        trx.updateTable("service_categories").set({ sort_order: 99 }).where("id", "=", "brake_work").execute(),
      );
      expect(updated[0]?.numUpdatedRows).toBe(1n);
    } finally {
      await closeDb();
    }
  });

  it("refuses a libSQL database without the schema, pointing at db:push:remote", async () => {
    vi.stubEnv("TURSO_DATABASE_URL", pathToFileURL(path.join(dir, "empty-hosted.db")).href);
    vi.resetModules();
    const { closeDb, getDb } = await import("@/server/db/client");
    try {
      await expect(getDb().selectFrom("users").select("id").execute()).rejects.toThrow(/has no schema.*db:push:remote/);
    } finally {
      await closeDb();
    }
  });
});

describe("local file storage", () => {
  it("stores, reads and removes files under its root", async () => {
    const root = path.join(dir, "uploads");
    const storage = createLocalFileStorage(root);
    const key = "request_photo/2026/3f0c2b9e-5d1a-4c55-9e8f-0b6f7f1d2a10.jpg";
    await storage.put(key, Buffer.from("jpeg bytes"));
    expect(fs.existsSync(path.join(root, "request_photo", "2026", "3f0c2b9e-5d1a-4c55-9e8f-0b6f7f1d2a10.jpg"))).toBe(true);
    expect((await storage.read(key)).toString()).toBe("jpeg bytes");
    await storage.remove(key);
    await storage.remove(key); // already gone: still fine
    await expect(storage.read(key)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("never overwrites an existing file", async () => {
    const storage = createLocalFileStorage(path.join(dir, "uploads"));
    await storage.put("mechanic_document/2026/doc.pdf", Buffer.from("first"));
    await expect(storage.put("mechanic_document/2026/doc.pdf", Buffer.from("second"))).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect((await storage.read("mechanic_document/2026/doc.pdf")).toString()).toBe("first");
  });

  it("rejects keys that are not plain lowercase relative paths with one extension", async () => {
    const storage = createLocalFileStorage(path.join(dir, "uploads"));
    const badKeys = [
      "../escape.jpg",
      "request_photo/../../escape.jpg",
      "/absolute.jpg",
      "C:/windows/escape.jpg",
      "request_photo\\2026\\x.jpg",
      "request_photo//x.jpg",
      "Request_Photo/x.jpg",
      "request_photo/x.tar.gz",
      "request_photo/no-extension",
      "request_photo/.jpg",
      "request_photo/x.jpg/",
      "nul.jpg",
      "request_photo/con.png",
      `request_photo/${"a".repeat(200)}.jpg`,
      "",
    ];
    for (const key of badKeys) {
      await expect(storage.put(key, Buffer.from("x")), key).rejects.toBeInstanceOf(InvalidStorageKeyError);
      await expect(storage.read(key), key).rejects.toBeInstanceOf(InvalidStorageKeyError);
      await expect(storage.remove(key), key).rejects.toBeInstanceOf(InvalidStorageKeyError);
    }
    expect(fs.existsSync(path.join(dir, "escape.jpg"))).toBe(false);
  });
});

describe("db:reset upload cleanup", () => {
  function write(root: string, relative: string): string {
    const file = path.join(root, ...relative.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, relative);
    return file;
  }

  it("deletes only the folders uploads are stored in, never anything else in UPLOAD_DIR", () => {
    // As if UPLOAD_DIR had been set to a source folder by mistake.
    const root = path.join(dir, "src");
    const stored = UPLOAD_FOLDERS.map((folder) => write(root, `${folder}/2026/file.jpg`));
    const unrelated = [write(root, "app/page.tsx"), write(root, "README.md"), write(root, "request-photos-old/keep.jpg")];

    expect(removeUploadFolders(root, UPLOAD_FOLDERS)).toEqual([]);
    for (const file of stored) expect(fs.existsSync(file), file).toBe(false);
    for (const folder of UPLOAD_FOLDERS) expect(fs.existsSync(path.join(root, folder)), folder).toBe(false);
    for (const file of unrelated) expect(fs.existsSync(file), file).toBe(true);
    expect(removeUploadFolders(root, UPLOAD_FOLDERS)).toEqual([]); // nothing left: still fine
  });

  it("removes the files saveFile stored", async () => {
    const t = createTestContext();
    try {
      const mechanic = await createUser(t.ctx, { role: "mechanic" });
      const bytes = new TextEncoder().encode("%PDF-1.4\n% demo document\n");
      const prepared = await prepareUpload({ bytes, name: "insurance.pdf", size: bytes.byteLength }, "mechanic_document");
      const saved = await writeTx(t.ctx.db, (trx) =>
        saveFile(trx, t.ctx, mechanic.id, prepared, "mechanic_document", "insurance.pdf"),
      );
      expect((await t.ctx.storage.read(saved.storageKey)).byteLength).toBe(bytes.byteLength);

      expect(removeUploadFolders(path.join(t.dir, "uploads"), UPLOAD_FOLDERS)).toEqual([]);
      await expect(t.ctx.storage.read(saved.storageKey)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await t.cleanup();
    }
  });

  it("refuses folder names that are not direct children of UPLOAD_DIR", () => {
    const keep = write(dir, "keep.txt");
    for (const folder of ["", ".", "..", "a/b", "../escape"]) {
      expect(() => removeUploadFolders(path.join(dir, "uploads"), [folder]), JSON.stringify(folder)).toThrow(/direct child/);
    }
    expect(fs.existsSync(keep)).toBe(true);
  });
});
