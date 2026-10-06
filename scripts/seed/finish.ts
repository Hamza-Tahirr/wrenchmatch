// Last steps: bring time-based states up to the seeding instant, let history read as
// history, and check the invariants the sample data relies on (failing loudly if one breaks).
import { sql, type Kysely } from "kysely";

import type { DB } from "@/server/db/schema.generated";
import { writeTx } from "@/server/db/tx";
import { expireStaleRecords } from "@/server/expiry";

import type { SeedRun } from "./types";

/** Notifications older than this were "seen" by their recipients. */
const READ_AFTER_HOURS = 48;

/** Text the seed itself wrote that people read in the app (presentation mode: no "demo" wording). */
const SEEDED_TEXT: ReadonlyArray<readonly [table: keyof DB, column: string]> = [
  ["users", "display_name"],
  ["mechanic_profiles", "display_name"],
  ["mechanic_profiles", "bio"],
  ["mechanic_profiles", "certifications"],
  ["mechanic_private", "legal_name"],
  ["mechanic_private", "business_name"],
  ["mechanic_private", "garage_address_line1"],
  ["mechanic_profiles", "insurance_provider"],
  ["mechanic_private", "insurance_policy_number"],
  ["repair_requests", "vehicle_model"],
  ["repair_requests", "description"],
  ["request_private", "street_address"],
  ["request_private", "location_notes"],
  ["quotes", "scope"],
  ["quotes", "exclusions"],
  ["quotes", "notes"],
  ["quote_items", "description"],
  ["change_orders", "description"],
  ["change_orders", "reason"],
  ["change_orders", "decision_note"],
  ["invoices", "notes"],
  ["reviews", "comment"],
  ["support_requests", "message"],
  ["support_requests", "resolution_note"],
  ["mechanic_gallery", "caption"],
  ["booking_photos", "caption"],
  ["files", "original_name"],
];

/** Text the app's own commands generated while seeding (notification and email copy). */
const GENERATED_TEXT: ReadonlyArray<readonly [table: keyof DB, column: string]> = [
  ["notifications", "title"],
  ["notifications", "body"],
  ["email_outbox", "subject"],
  ["email_outbox", "body_text"],
  ["invoices", "invoice_number"],
];

/** Every "table.column: value" in `columns` that mentions "demo" (any case). */
export async function findDemoWording(db: Kysely<DB>, columns: ReadonlyArray<readonly [keyof DB, string]>): Promise<string[]> {
  const found: string[] = [];
  for (const [table, column] of columns) {
    const result = await sql<{ value: string }>`SELECT ${sql.ref(column)} AS value FROM ${sql.table(table)} WHERE ${sql.ref(column)} LIKE '%demo%'`.execute(db);
    for (const row of result.rows) found.push(`${table}.${column}: ${row.value.slice(0, 120)}`);
  }
  return found;
}

async function verify(run: SeedRun): Promise<void> {
  const problems: string[] = [];
  const counts = await run.db
    .selectFrom("repair_requests as r")
    .select(["r.id", "r.matched_count", sql<number>`(SELECT count(*) FROM job_matches AS m WHERE m.request_id = r.id)`.as("matches")])
    .execute();
  for (const row of counts) {
    if (row.matched_count !== Number(row.matches)) problems.push(`request ${row.id}: matched_count ${row.matched_count} != ${row.matches} job matches`);
  }
  const unflagged = await run.db
    .selectFrom("bookings")
    .select(["id"])
    .where("status", "!=", "pending_payment")
    .where("is_demo_fixture", "=", 0)
    .execute();
  for (const row of unflagged) problems.push(`booking ${row.id} is past pending_payment but not a seeded fixture`);
  problems.push(...(await findDemoWording(run.db, SEEDED_TEXT)).map((entry) => `"demo" wording in ${entry}`));
  if (problems.length > 0) throw new Error(`Sample data check failed:\n${problems.join("\n")}`);

  // Copy written by the app's commands belongs to the app; report it rather than fail the seed.
  const generated = await findDemoWording(run.db, GENERATED_TEXT);
  if (generated.length > 0) run.log(`Note: app-generated text still says "demo" (${generated.length}): ${generated.slice(0, 5).join(" | ")}`);
}

export async function finishSeed(run: SeedRun): Promise<void> {
  const cutoff = run.clock.hoursAgo(READ_AFTER_HOURS).toISOString();
  await writeTx(run.db, async (trx) => {
    // e.g. the brake quote that lapsed overnight becomes "expired", as the app would record it.
    await expireStaleRecords(trx, run.clock.now);
    // Read two hours after arrival; only the last two days' notifications stay unread.
    await trx
      .updateTable("notifications")
      .set({ read_at: sql<string>`strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+2 hours')` })
      .where("read_at", "is", null)
      .where("created_at", "<", cutoff)
      .execute();
  });
  await verify(run);
}

export { GENERATED_TEXT, SEEDED_TEXT };
