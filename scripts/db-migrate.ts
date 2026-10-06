// Applies pending db/migrations/*.sql (npm run db:migrate) to the database the app would use:
// the libSQL database in TURSO_DATABASE_URL when that is set in the environment, otherwise the
// SQLite file DATABASE_PATH. `npm run db:migrate:remote` (--remote) always targets the hosted
// database, with TURSO_DATABASE_URL / TURSO_AUTH_TOKEN from the environment or .env.vercel.
import "../src/server/db/script-runtime";

import fs from "node:fs";
import path from "node:path";

import { MISSING_REMOTE_TARGET, readRemoteTarget } from "./db-remote-target";

function report(applied: string[], target: string): void {
  console.log(
    applied.length > 0
      ? `Applied ${applied.length} migration(s) to ${target}: ${applied.join(", ")}`
      : `${target} is up to date.`,
  );
}

async function migrateLibsqlDatabase(url: string, authToken: string | null): Promise<void> {
  const { describeLibsqlUrl, openLibsqlClient } = await import("../src/server/db/libsql");
  const { migrateOnLibsql } = await import("../src/server/db/migrate");
  const client = await openLibsqlClient({ url, authToken });
  try {
    report(await migrateOnLibsql(client), describeLibsqlUrl(url));
  } finally {
    client.close();
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--remote")) {
    const remote = readRemoteTarget();
    if (!remote) throw new Error(MISSING_REMOTE_TARGET);
    console.log(`Hosted database settings from ${remote.source}.`);
    await migrateLibsqlDatabase(remote.url, remote.authToken);
    return;
  }

  const { DATABASE_PATH, TURSO_AUTH_TOKEN, TURSO_DATABASE_URL } = await import("../src/server/config");
  if (TURSO_DATABASE_URL) {
    await migrateLibsqlDatabase(TURSO_DATABASE_URL, TURSO_AUTH_TOKEN);
    return;
  }

  const { openSqlite } = await import("../src/server/db/sqlite");
  const { migrate } = await import("../src/server/db/migrate");
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
  const sqlite = openSqlite(DATABASE_PATH);
  try {
    report(migrate(sqlite), path.relative(process.cwd(), DATABASE_PATH) || DATABASE_PATH);
  } finally {
    sqlite.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
