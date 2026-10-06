import "server-only";

import type { SqliteDatabase } from "./sqlite";

// Renders Kysely table interfaces from a migrated SQLite database (used by
// scripts/gen-db-types.ts and by a freshness test). Output is deterministic.

export const GENERATED_HEADER = "// generated - do not edit; run npm run db:types";

/**
 * True when the file on disk already holds `rendered`. Line endings are ignored: a Git
 * checkout with core.autocrlf (the Windows default) turns the generated LF file into CRLF.
 */
export function isSameGeneratedSource(existing: string | null, rendered: string): boolean {
  return existing !== null && existing.replace(/\r\n/g, "\n") === rendered;
}

const SKIPPED_TABLES = new Set(["schema_migrations"]);

type TableInfo = { name: string; type: string; strict: number };
type ColumnInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
  hidden: number; // 0 normal, 1 hidden (virtual tables), 2 generated VIRTUAL, 3 generated STORED
};

// SQLite type affinity rules (https://sqlite.org/datatype3.html#determination_of_column_affinity).
function tsTypeFor(declaredType: string): string {
  const type = declaredType.toUpperCase();
  if (type.includes("INT")) return "number";
  if (type.includes("CHAR") || type.includes("CLOB") || type.includes("TEXT")) return "string";
  if (type === "" || type.includes("BLOB")) return "Buffer";
  if (type === "ANY") return "unknown";
  return "number"; // REAL, FLOA, DOUB and NUMERIC affinity
}

function interfaceName(table: string): string {
  return table
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

function quoteKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

export function renderSchemaTypes(sqlite: SqliteDatabase): string {
  const tables = sqlite
    .prepare<[], TableInfo>("SELECT name, type, strict FROM pragma_table_list WHERE schema = 'main'")
    .all()
    .filter((t) => t.type === "table" && !t.name.startsWith("sqlite_") && !SKIPPED_TABLES.has(t.name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const columnQuery = sqlite.prepare<[string], ColumnInfo>(
    "SELECT cid, name, type, \"notnull\", dflt_value, pk, hidden FROM pragma_table_xinfo(?, 'main')",
  );
  const helpers = new Set<string>();
  const blocks: string[] = [];

  for (const table of tables) {
    const columns = columnQuery
      .all(table.name)
      .filter((c) => c.hidden !== 1)
      .sort((a, b) => a.cid - b.cid);
    const pkColumns = columns.filter((c) => c.pk > 0);

    const lines = columns.map((column) => {
      const base = tsTypeFor(column.type);
      const isRowidAlias =
        pkColumns.length === 1 && column.pk === 1 && column.type.toUpperCase() === "INTEGER";
      // STRICT tables make primary-key columns NOT NULL even without the keyword.
      const notNull = column.notnull === 1 || isRowidAlias || (column.pk > 0 && table.strict === 1);
      let type = notNull ? base : `${base} | null`;
      if (column.hidden === 2 || column.hidden === 3) {
        helpers.add("GeneratedAlways");
        type = `GeneratedAlways<${type}>`;
      } else if (column.dflt_value !== null || isRowidAlias) {
        helpers.add("Generated");
        type = `Generated<${type}>`;
      }
      return `  ${quoteKey(column.name)}: ${type};`;
    });

    blocks.push(`export interface ${interfaceName(table.name)} {\n${lines.join("\n")}\n}`);
  }

  const dbLines = tables.map((t) => `  ${quoteKey(t.name)}: ${interfaceName(t.name)};`);
  blocks.push(`export interface DB {\n${dbLines.join("\n")}\n}`);

  const imports = [...helpers].sort();
  const importLine = imports.length > 0 ? `import type { ${imports.join(", ")} } from "kysely";\n\n` : "";
  return `${GENERATED_HEADER}\n\n${importLine}${blocks.join("\n\n")}\n`;
}
