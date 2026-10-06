// Recreates local data from scratch (npm run db:reset): deletes DATABASE_PATH (with its
// WAL files) and the stored uploads under UPLOAD_DIR, applies every migration, then runs
// the demo seed. When a running `npm run dev` holds the database open (Windows refuses to
// delete open files), the file is emptied in place instead, so the reset works without
// stopping the server.
import "../src/server/db/script-runtime";

import fs from "node:fs";
import path from "node:path";

import type { SqliteDatabase } from "../src/server/db/sqlite";
import { removeFileIfUnlocked, removeUploadFolders } from "./reset-uploads";

const SUMMARY_TABLES = [
  "users",
  "mechanic_profiles",
  "service_categories",
  "pilot_zips",
  "repair_requests",
  "quotes",
  "bookings",
] as const;

function display(target: string): string {
  return path.relative(process.cwd(), target) || target;
}

function assertSafeDirectoryToDelete(dir: string): void {
  const fromDirToProject = path.relative(dir, process.cwd());
  const containsProject = !fromDirToProject.startsWith("..") && !path.isAbsolute(fromDirToProject);
  if (path.parse(dir).root === dir || containsProject) {
    throw new Error(
      `Refusing to delete ${dir}: UPLOAD_DIR must not be a filesystem root or contain the project.`,
    );
  }
}

/** Drops every table, view, index and trigger so migrations can rebuild the open file. */
function emptyDatabaseInPlace(sqlite: SqliteDatabase): void {
  sqlite.pragma("foreign_keys = OFF");
  const objects = sqlite
    .prepare<[], { type: string; name: string }>(
      "SELECT type, name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND type IN ('trigger', 'view', 'table')",
    )
    .all();
  const order = ["trigger", "view", "table"];
  sqlite.transaction(() => {
    for (const type of order) {
      for (const { name } of objects.filter((object) => object.type === type)) {
        sqlite.exec(`DROP ${type.toUpperCase()} IF EXISTS "${name.replaceAll('"', '""')}"`);
      }
    }
  })();
  sqlite.pragma("foreign_keys = ON");
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to reset the database while NODE_ENV=production.");
  }
  const { DATABASE_PATH, TURSO_DATABASE_URL, UPLOAD_DIR } = await import("../src/server/config");
  const { closeDb } = await import("../src/server/db/client");
  const { openSqlite } = await import("../src/server/db/sqlite");
  const { migrate } = await import("../src/server/db/migrate");
  const { UPLOAD_FOLDERS } = await import("../src/server/storage/uploads");

  if (TURSO_DATABASE_URL) {
    console.log(
      'TURSO_DATABASE_URL is set; db:reset rebuilds only the local file. Copy the result with "npm run db:push:remote".',
    );
  }
  assertSafeDirectoryToDelete(UPLOAD_DIR);
  if (removeFileIfUnlocked(DATABASE_PATH)) {
    for (const suffix of ["-wal", "-shm"]) removeFileIfUnlocked(`${DATABASE_PATH}${suffix}`);
  } else {
    console.log(`${display(DATABASE_PATH)} is open in another process (e.g. npm run dev); emptying it in place.`);
    const open = openSqlite(DATABASE_PATH, { fileMustExist: true });
    try {
      emptyDatabaseInPlace(open);
    } finally {
      open.close();
    }
  }
  const leftovers = removeUploadFolders(UPLOAD_DIR, UPLOAD_FOLDERS);
  if (leftovers.length > 0) {
    console.warn(`Could not delete ${leftovers.length} open upload file(s); they are unused orphans now.`);
  }
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const sqlite = openSqlite(DATABASE_PATH);
  let applied: string[];
  try {
    applied = migrate(sqlite);
  } finally {
    sqlite.close();
  }
  console.log(`Created ${display(DATABASE_PATH)} with migrations: ${applied.join(", ")}`);

  const { seed } = await import("./seed");
  await seed();
  await closeDb();

  const check = openSqlite(DATABASE_PATH, { fileMustExist: true });
  try {
    const counts = SUMMARY_TABLES.map((table) => {
      const row = check.prepare<[], { n: number }>(`SELECT count(*) AS n FROM ${table}`).get();
      return `${table}=${row?.n ?? 0}`;
    });
    console.log(`Database ready. Rows: ${counts.join(", ")}`);
    console.log(`Uploads directory: ${display(UPLOAD_DIR)}`);
  } finally {
    check.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
