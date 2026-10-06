import "server-only";

import { sql } from "kysely";

import { REQUEST_STATUSES, type RequestStatus } from "@/lib/domain";
import type { AppContext, Viewer } from "@/server/context";

import { assertAdmin } from "./access";
import { effectiveRequestStatusSql } from "./effective-status";
import { MATCHING_FAILURE_THRESHOLD } from "./matching";
import { reportingTimeZone } from "./reporting";

// Small counts for the admin shell (navigation badges) and the request list tabs. Every
// number is counted at request time, with the same rules as the lists they link to.

export type AdminNavCounts = {
  /** Applications to review: applied + under review (the "Awaiting review" tab). */
  mechanicsAwaitingReview: number;
  /** Requests on the matching-failures page: waiting for quotes, fewer than 2 mechanics notified. */
  matchingFailures: number;
  /** Open help requests (the help desk's "Open" tab). */
  supportOpen: number;
};

export type AdminShellInfo = {
  /** The zone admin pages show times in: the zone most enabled pilot ZIPs are in (UTC without any). */
  reportingTimeZone: string;
  counts: AdminNavCounts;
};

export type RequestStatusCounts = {
  /** Requests by status as of now, drafts included. */
  byStatus: Record<RequestStatus, number>;
  /** Every submitted request (the list's default view: everything but drafts). */
  submitted: number;
  /** Waiting for quotes now: open + quoted. */
  active: number;
  /** Of the active requests, how many reached no mechanic. */
  activeWithoutMatches: number;
};

/** Navigation badge counts and the reporting time zone for the admin layout. */
export async function getAdminShell(ctx: AppContext, viewer: Viewer): Promise<AdminShellInfo> {
  assertAdmin(viewer);
  const nowIso = ctx.now.toISOString();
  const [timeZone, row] = await Promise.all([
    reportingTimeZone(ctx.db),
    ctx.db
      .selectNoFrom([
        sql<number>`(SELECT count(*) FROM mechanic_profiles WHERE status IN ('applied', 'under_review'))`.as(
          "awaiting_review",
        ),
        sql<number>`(SELECT count(*) FROM repair_requests AS r
          WHERE ${effectiveRequestStatusSql("r", nowIso)} IN ('open', 'quoted')
            AND r.matched_count < ${MATCHING_FAILURE_THRESHOLD})`.as("matching_failures"),
        sql<number>`(SELECT count(*) FROM support_requests WHERE status = 'open')`.as("support_open"),
      ])
      .executeTakeFirstOrThrow(),
  ]);
  return {
    reportingTimeZone: timeZone,
    counts: {
      mechanicsAwaitingReview: Number(row.awaiting_review),
      matchingFailures: Number(row.matching_failures),
      supportOpen: Number(row.support_open),
    },
  };
}

/** Request counts per status as of now, for the request list's tabs. */
export async function getRequestStatusCounts(ctx: AppContext, viewer: Viewer): Promise<RequestStatusCounts> {
  assertAdmin(viewer);
  const nowIso = ctx.now.toISOString();
  const rows = await ctx.db
    .selectFrom(
      ctx.db
        .selectFrom("repair_requests as r")
        .select([effectiveRequestStatusSql("r", nowIso).as("status"), "r.matched_count"])
        .as("x"),
    )
    .select([
      "x.status",
      (eb) => eb.fn.countAll<number>().as("count"),
      sql<number>`sum(CASE WHEN x.matched_count = 0 THEN 1 ELSE 0 END)`.as("zero_matches"),
    ])
    .groupBy("x.status")
    .execute();

  const byStatus = Object.fromEntries(REQUEST_STATUSES.map((status) => [status, 0])) as Record<RequestStatus, number>;
  let activeWithoutMatches = 0;
  for (const row of rows) {
    const status = REQUEST_STATUSES.find((candidate) => candidate === row.status);
    if (status === undefined) continue;
    byStatus[status] += Number(row.count);
    if (status === "open" || status === "quoted") activeWithoutMatches += Number(row.zero_matches);
  }
  const total = Object.values<number>(byStatus).reduce((sum, count) => sum + count, 0);
  return {
    byStatus,
    submitted: total - byStatus.draft,
    active: byStatus.open + byStatus.quoted,
    activeWithoutMatches,
  };
}
