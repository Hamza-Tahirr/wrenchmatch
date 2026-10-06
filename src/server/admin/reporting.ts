import "server-only";

import { sql, type Kysely } from "kysely";

import { addDaysToDate, isValidTimeZone, todayInZone, zonedDateTimeToUtc } from "@/lib/time";
import type { DB } from "@/server/db/schema.generated";

/**
 * The time zone admin "today" counts use: the zone most of the enabled pilot ZIPs are in
 * (the pilot area is configurable, so nothing is hard-coded), or UTC without pilot ZIPs.
 */
export async function reportingTimeZone(db: Kysely<DB>): Promise<string> {
  const row = await db
    .selectFrom("pilot_zips as p")
    .innerJoin("zip_centroids as z", "z.zip", "p.zip")
    .select("z.time_zone")
    .groupBy("z.time_zone")
    .orderBy(sql`sum(p.enabled)`, "desc")
    .orderBy(sql`count(*)`, "desc")
    .orderBy("z.time_zone")
    .executeTakeFirst();
  return row && isValidTimeZone(row.time_zone) ? row.time_zone : "UTC";
}

/** The UTC instants where the calendar day containing `now` starts and ends in `timeZone`. */
export function dayRangeInZone(now: Date, timeZone: string): { startIso: string; endIso: string } {
  const today = todayInZone(now, timeZone);
  return {
    startIso: zonedDateTimeToUtc(`${today}T00:00`, timeZone).toISOString(),
    endIso: zonedDateTimeToUtc(`${addDaysToDate(today, 1)}T00:00`, timeZone).toISOString(),
  };
}
