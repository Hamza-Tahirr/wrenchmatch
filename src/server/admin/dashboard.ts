import "server-only";

import { sql, type RawBuilder } from "kysely";

import {
  BOOKING_STATUSES,
  MECHANIC_STATUSES,
  REQUEST_STATUSES,
  type BookingStatus,
  type MechanicStatus,
  type RequestStatus,
} from "@/lib/domain";
import { INSURANCE_WARNING_DAYS } from "@/lib/validation/admin";
import type { AppContext, Viewer } from "@/server/context";

import { assertAdmin } from "./access";
import { AUDIT_ROWID, auditEventsQuery, toAuditEventItem, type AuditEventItem } from "./audit-items";
import { effectiveQuoteStatusSql, effectiveRequestStatusSql } from "./effective-status";
import { loadInsuranceStandings } from "./mechanics";
import { dayRangeInZone, reportingTimeZone } from "./reporting";
import { requestItemsFrom, selectRequestItems, toRequestListItem, type AdminRequestListItem } from "./request-items";

// The admin home page. Every number is counted from the database at request time; nothing
// is hard-coded or estimated.

export type AdminDashboard = {
  generatedAt: string;
  /** Zone of "today" counts: the zone most enabled pilot ZIPs are in (UTC without any). */
  reportingTimeZone: string;
  mechanics: {
    /** Applications to review: applied + under review. */
    awaitingReview: number;
    byStatus: Record<MechanicStatus, number>;
    /** Mechanics (not rejected) whose recorded insurance has expired. */
    insuranceExpired: number;
    /** ...or expires within INSURANCE_WARNING_DAYS days (30). */
    insuranceExpiringSoon: number;
    insuranceWarningDays: number;
    /** Uploaded documents nobody has reviewed yet. */
    pendingDocuments: number;
    /** Brake/suspension services offered (mechanic not rejected) that no admin has approved. */
    safetyApprovalsPending: number;
    /** Mechanic accounts that have not started an application. */
    accountsWithoutApplication: number;
  };
  requests: {
    /** Waiting for quotes now (open + quoted). */
    open: number;
    /** Of those, how many reached no mechanic (needs follow-up). */
    openWithZeroMatches: number;
    /** Every request by status as of now, drafts included. */
    byStatus: Record<RequestStatus, number>;
  };
  quotes: {
    /** Submitted quotes a customer can still select (not expired). */
    active: number;
  };
  bookings: {
    /** Reservations waiting for payment (they stay pending: Stripe is not connected). */
    pendingPayment: number;
    /**
     * Jobs past the reservation (confirmed, later or cancelled after), by status now. While
     * online payments are not connected only seeded bookings get there (is_demo_fixture),
     * with no online payment taken.
     */
    bookedByStatus: Record<BookingStatus, number>;
    bookedTotal: number;
  };
  /** Proposed change orders waiting for the customer's decision. */
  changeOrdersAwaitingCustomer: number;
  supportRequestsOpen: number;
  /** Emails captured in the local outbox since midnight in reportingTimeZone. */
  emailsCapturedToday: number;
  /** The 10 newest audit events. */
  recentAuditEvents: AuditEventItem[];
  /** The 5 newest submitted requests. */
  recentRequests: AdminRequestListItem[];
};

const RECENT_AUDIT_EVENTS = 10;
const RECENT_REQUESTS = 5;

function zeroCounts<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function countInto<T extends string>(
  target: Record<T, number>,
  keys: readonly T[],
  rows: readonly { key: string; count: number | string | bigint }[],
): Record<T, number> {
  for (const row of rows) {
    const key = keys.find((candidate) => candidate === row.key);
    if (key !== undefined) target[key] += Number(row.count);
  }
  return target;
}

/** Counts, recent activity and to-do numbers for the admin dashboard. */
export async function getDashboard(ctx: AppContext, viewer: Viewer): Promise<AdminDashboard> {
  assertAdmin(viewer);
  const { db } = ctx;
  const nowIso = ctx.now.toISOString();
  const timeZone = await reportingTimeZone(db);
  const today = dayRangeInZone(ctx.now, timeZone);

  const scalar = (expression: RawBuilder<number>) =>
    db.selectNoFrom(expression.as("n")).executeTakeFirstOrThrow().then((row) => Number(row.n));

  const [
    mechanicRows,
    insurance,
    pendingDocuments,
    safetyApprovalsPending,
    accountsWithoutApplication,
    requestRows,
    activeQuotes,
    bookingRows,
    changeOrdersAwaitingCustomer,
    supportRequestsOpen,
    emailsCapturedToday,
    auditRows,
    requestItemRows,
  ] = await Promise.all([
    db
      .selectFrom("mechanic_profiles")
      .select(["status as key", (eb) => eb.fn.countAll<number>().as("count")])
      .groupBy("status")
      .execute(),
    loadInsuranceStandings(db, ctx.now, INSURANCE_WARNING_DAYS),
    scalar(sql<number>`(SELECT count(*) FROM mechanic_documents WHERE status = 'pending')`),
    scalar(sql<number>`(SELECT count(*) FROM mechanic_services AS s
      JOIN service_categories AS c ON c.id = s.category_id
      JOIN mechanic_profiles AS p ON p.user_id = s.mechanic_id
      WHERE c.safety_sensitive = 1 AND s.safety_approved = 0 AND p.status != 'rejected')`),
    scalar(sql<number>`(SELECT count(*) FROM users AS u
      WHERE u.role = 'mechanic'
        AND NOT EXISTS (SELECT 1 FROM mechanic_profiles AS p WHERE p.user_id = u.id))`),
    db
      .selectFrom(
        db
          .selectFrom("repair_requests as r")
          .select([effectiveRequestStatusSql("r", nowIso).as("status"), "r.matched_count"])
          .as("x"),
      )
      .select([
        "x.status as key",
        (eb) => eb.fn.countAll<number>().as("count"),
        sql<number>`sum(CASE WHEN x.matched_count = 0 THEN 1 ELSE 0 END)`.as("zero_matches"),
      ])
      .groupBy("x.status")
      .execute(),
    db
      .selectFrom("quotes as q")
      .innerJoin("repair_requests as r", "r.id", "q.request_id")
      .select((eb) => eb.fn.countAll<number>().as("n"))
      .where((eb) => eb(effectiveQuoteStatusSql("q", "r", nowIso), "=", "submitted"))
      .executeTakeFirstOrThrow()
      .then((row) => Number(row.n)),
    db
      .selectFrom("bookings")
      .select([
        "status as key",
        "is_demo_fixture as booked",
        (eb) => eb.fn.countAll<number>().as("count"),
      ])
      .groupBy(["status", "is_demo_fixture"])
      .execute(),
    scalar(sql<number>`(SELECT count(*) FROM change_orders WHERE status = 'proposed')`),
    scalar(sql<number>`(SELECT count(*) FROM support_requests WHERE status = 'open')`),
    scalar(sql<number>`(SELECT count(*) FROM email_outbox
      WHERE created_at >= ${today.startIso} AND created_at < ${today.endIso})`),
    auditEventsQuery(db)
      .orderBy("a.created_at", "desc")
      .orderBy(AUDIT_ROWID, "desc")
      .limit(RECENT_AUDIT_EVENTS)
      .execute(),
    selectRequestItems(requestItemsFrom(db).where("r.status", "!=", "draft"), nowIso)
      .orderBy("r.created_at", "desc")
      .orderBy(sql`r.rowid`, "desc")
      .limit(RECENT_REQUESTS)
      .execute(),
  ]);

  const byStatus = countInto(zeroCounts(MECHANIC_STATUSES), MECHANIC_STATUSES, mechanicRows);
  const requestsByStatus = countInto(zeroCounts(REQUEST_STATUSES), REQUEST_STATUSES, requestRows);
  const openWithZeroMatches = requestRows
    .filter((row) => row.key === "open" || row.key === "quoted")
    .reduce((sum, row) => sum + Number(row.zero_matches), 0);
  const bookedByStatus = countInto(
    zeroCounts(BOOKING_STATUSES),
    BOOKING_STATUSES,
    bookingRows.filter((row) => row.booked === 1),
  );

  return {
    generatedAt: nowIso,
    reportingTimeZone: timeZone,
    mechanics: {
      awaitingReview: byStatus.applied + byStatus.under_review,
      byStatus,
      insuranceExpired: insurance.filter((item) => item.insurance.state === "expired").length,
      insuranceExpiringSoon: insurance.filter((item) => item.insurance.state === "expiring_soon").length,
      insuranceWarningDays: INSURANCE_WARNING_DAYS,
      pendingDocuments,
      safetyApprovalsPending,
      accountsWithoutApplication,
    },
    requests: {
      open: requestsByStatus.open + requestsByStatus.quoted,
      openWithZeroMatches,
      byStatus: requestsByStatus,
    },
    quotes: { active: activeQuotes },
    bookings: {
      pendingPayment: bookingRows
        .filter((row) => row.key === "pending_payment")
        .reduce((sum, row) => sum + Number(row.count), 0),
      bookedByStatus,
      bookedTotal: Object.values<number>(bookedByStatus).reduce((sum, count) => sum + count, 0),
    },
    changeOrdersAwaitingCustomer,
    supportRequestsOpen,
    emailsCapturedToday,
    recentAuditEvents: auditRows.map(toAuditEventItem),
    recentRequests: requestItemRows.map(toRequestListItem),
  };
}
