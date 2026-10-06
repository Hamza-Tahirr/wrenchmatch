// splitSqlStatements(): the statements of a migration file, one per libSQL batch step.
import fs from "node:fs";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { listMigrationFiles } from "@/server/db/migrate";
import { splitSqlStatements } from "@/server/db/split-sql";

const SCHEMA = "SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name";

describe("splitSqlStatements", () => {
  it("splits each migration into single statements that rebuild the same schema", () => {
    const byFile = new Database(":memory:");
    const byStatement = new Database(":memory:");
    try {
      for (const migration of listMigrationFiles()) {
        const source = fs.readFileSync(migration.filePath, "utf8");
        byFile.exec(source);
        for (const statement of splitSqlStatements(source)) {
          // prepare() refuses text holding more than one statement (or an incomplete one)
          byStatement.prepare(statement).run();
        }
      }
      expect(byStatement.prepare(SCHEMA).all()).toEqual(byFile.prepare(SCHEMA).all());
      expect(byStatement.prepare("SELECT count(*) AS n FROM service_categories").get()).toEqual({ n: 12 });
    } finally {
      byFile.close();
      byStatement.close();
    }
  });

  it("keeps a trigger body, CASE ... END included, in one statement", () => {
    const sql = [
      "CREATE TABLE t (a INTEGER, b TEXT);",
      "CREATE TRIGGER t_guard BEFORE UPDATE ON t",
      "WHEN CASE WHEN new.a > 1 THEN 1 ELSE 0 END = 1",
      "BEGIN",
      "  SELECT RAISE(ABORT, 'too_big; really');",
      "  UPDATE t SET b = 'end;' WHERE a = old.a;",
      "END;",
      "CREATE TEMP TRIGGER IF NOT EXISTS t_temp AFTER INSERT ON t BEGIN SELECT 1; END;",
      "INSERT INTO t VALUES (1, 'x');",
    ].join("\n");
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(4);
    expect(statements[1]).toMatch(/^CREATE TRIGGER t_guard[\s\S]*END;$/);
    expect(statements[2]).toBe("CREATE TEMP TRIGGER IF NOT EXISTS t_temp AFTER INSERT ON t BEGIN SELECT 1; END;");
    expect(statements[3]).toBe("INSERT INTO t VALUES (1, 'x');");
  });

  it("ignores semicolons in strings, quoted identifiers and comments", () => {
    const sql = [
      "-- a comment; with a semicolon",
      "INSERT INTO \"odd;name\" VALUES ('it''s; fine', [x;y], `z;`); /* c; */",
      "/* block; comment */ SELECT 'a' -- trailing; comment",
      ";",
      ";;",
      "SELECT end_at FROM t", // no final semicolon; "end_at" is not the END keyword
    ].join("\n");
    expect(splitSqlStatements(sql)).toEqual([
      "INSERT INTO \"odd;name\" VALUES ('it''s; fine', [x;y], `z;`);",
      "SELECT 'a' -- trailing; comment\n;",
      "SELECT end_at FROM t",
    ]);
  });

  it("returns nothing for whitespace and comments only", () => {
    expect(splitSqlStatements("  \n-- only a comment\n/* and another */\n")).toEqual([]);
  });

  it("throws on unterminated strings, comments and triggers", () => {
    expect(() => splitSqlStatements("SELECT 'open;")).toThrow(/Unterminated string/);
    expect(() => splitSqlStatements("SELECT 1; /* open")).toThrow(/Unterminated comment/);
    expect(() => splitSqlStatements('SELECT "open')).toThrow(/Unterminated quoted identifier/);
    expect(() => splitSqlStatements("CREATE TRIGGER t AFTER INSERT ON x BEGIN SELECT 1;")).toThrow(/CREATE TRIGGER/);
  });
});
