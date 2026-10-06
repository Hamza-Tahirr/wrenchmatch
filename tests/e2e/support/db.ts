import path from "node:path";

import Database from "better-sqlite3";

// Read-only lookups in the app's SQLite database (.data/app.db, or DATABASE_PATH), used to
// find record ids and to check what the UI claims. The suite never writes to the database:
// every change goes through the UI.

const DATABASE_PATH = path.resolve(__dirname, "..", "..", "..", process.env.DATABASE_PATH ?? ".data/app.db");

type Param = string | number | null;

function withDb<T>(run: (db: Database.Database) => T): T {
  const db = new Database(DATABASE_PATH, { readonly: true, fileMustExist: true });
  db.pragma("busy_timeout = 5000");
  try {
    return run(db);
  } finally {
    db.close();
  }
}

export function dbAll<T>(sql: string, ...params: Param[]): T[] {
  return withDb((db) => db.prepare(sql).all(...params) as T[]);
}

export function dbGet<T>(sql: string, ...params: Param[]): T | undefined {
  return withDb((db) => db.prepare(sql).get(...params) as T | undefined);
}

export function dbValue(sql: string, ...params: Param[]): number {
  const row = withDb((db) => db.prepare(sql).raw(true).get(...params) as unknown[] | undefined);
  return Number(row?.[0] ?? 0);
}

export function userIdByEmail(email: string): string {
  const row = dbGet<{ id: string }>("SELECT id FROM users WHERE email = ?", email.toLowerCase());
  if (!row) throw new Error(`No user with email ${email}`);
  return row.id;
}

export type Interval = { start: string; end: string };

/** Time slots a mechanic has committed (active quotes and live bookings), as UTC ISO strings. */
export function committedSlots(mechanicId: string): Interval[] {
  return dbAll<Interval>(
    `SELECT slot_start_at AS start, slot_end_at AS "end" FROM quotes
       WHERE mechanic_id = ? AND status IN ('submitted', 'selected')
     UNION ALL
     SELECT slot_start_at, slot_end_at FROM bookings
       WHERE mechanic_id = ? AND status IN ('pending_payment', 'confirmed', 'in_progress')`,
    mechanicId,
    mechanicId,
  );
}
