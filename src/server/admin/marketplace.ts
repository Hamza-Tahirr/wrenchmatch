import "server-only";

import { sql } from "kysely";

import type { BookingStatus, QuoteStatus } from "@/lib/domain";
import { bookingListQuerySchema, quoteListQuerySchema, reviewListQuerySchema } from "@/lib/validation/admin";
import type { AppContext, Viewer } from "@/server/context";

import { assertAdmin } from "./access";
import { bookingItemsFrom, selectBookingItems, toBookingListItem, type AdminBookingListItem } from "./booking-items";
import { effectiveQuoteStatusSql } from "./effective-status";
import { parseAdminInput } from "./input";
import { pageWindow, toPaged } from "./paging";
import { quoteItemsFrom, selectQuoteItems, toQuoteListItem, type AdminQuoteListItem } from "./quote-items";
import type { Paged, PersonRef } from "./types";

// The marketplace view: quotes, pending-payment reservations, bookings (real reservations
// and seeded confirmed jobs) and reviews. Interventions live in interventions.ts.

export type AdminReviewItem = {
  id: string;
  bookingId: string;
  requestId: string;
  rating: number;
  comment: string | null;
  /** Seeded sample reviews never count toward a mechanic's rating (show "not counted"). */
  isDemoFixture: boolean;
  mechanic: PersonRef;
  customer: PersonRef;
  createdAt: string;
};

/** Quotes, newest first, filtered by their status as of now. */
export async function listQuotes(
  ctx: AppContext,
  viewer: Viewer,
  filters: { status?: QuoteStatus; page?: number } = {},
): Promise<Paged<AdminQuoteListItem>> {
  assertAdmin(viewer);
  const { status, page } = parseAdminInput(quoteListQuerySchema, filters);
  const nowIso = ctx.now.toISOString();
  const filtered = status
    ? quoteItemsFrom(ctx.db).where((eb) => eb(effectiveQuoteStatusSql("q", "r", nowIso), "=", status))
    : quoteItemsFrom(ctx.db);

  const { total } = await filtered.select((eb) => eb.fn.countAll<number>().as("total")).executeTakeFirstOrThrow();
  const window = pageWindow(page, Number(total));
  const rows = await selectQuoteItems(filtered, nowIso)
    .orderBy("q.created_at", "desc")
    .orderBy(sql`q.rowid`, "desc")
    .limit(window.pageSize)
    .offset(window.offset)
    .execute();
  return toPaged(rows.map(toQuoteListItem), window, Number(total));
}

/**
 * Pending-payment reservations, oldest first. They stay pending: Stripe is not connected,
 * so nothing can confirm them (a database trigger enforces this).
 */
export async function listReservations(ctx: AppContext, viewer: Viewer): Promise<AdminBookingListItem[]> {
  assertAdmin(viewer);
  const rows = await selectBookingItems(bookingItemsFrom(ctx.db).where("b.status", "=", "pending_payment"))
    .orderBy("b.created_at")
    .orderBy(sql`b.rowid`)
    .execute();
  return rows.map(toBookingListItem);
}

/**
 * Every booking, newest first: pending-payment reservations and confirmed jobs (with the
 * interventions available on each). Filter by status, or to bookings that were confirmed
 * (bookedOnly: jobs past the reservation, which only seeded bookings reach while online payments
 * are not connected; a database trigger keeps every real booking at pending payment).
 */
export async function listBookings(
  ctx: AppContext,
  viewer: Viewer,
  filters: { status?: BookingStatus; bookedOnly?: boolean; page?: number } = {},
): Promise<Paged<AdminBookingListItem>> {
  assertAdmin(viewer);
  const { status, bookedOnly, page } = parseAdminInput(bookingListQuerySchema, filters);
  const filtered = bookingItemsFrom(ctx.db).where((eb) => {
    const conditions = [];
    if (status) conditions.push(eb("b.status", "=", status));
    if (bookedOnly) conditions.push(eb("b.is_demo_fixture", "=", 1));
    return eb.and(conditions);
  });

  const { total } = await filtered.select((eb) => eb.fn.countAll<number>().as("total")).executeTakeFirstOrThrow();
  const window = pageWindow(page, Number(total));
  const rows = await selectBookingItems(filtered)
    .orderBy("b.created_at", "desc")
    .orderBy(sql`b.rowid`, "desc")
    .limit(window.pageSize)
    .offset(window.offset)
    .execute();
  return toPaged(rows.map(toBookingListItem), window, Number(total));
}

/** Reviews, newest first, with the fixture flag (seeded sample reviews never count toward ratings). */
export async function listReviews(
  ctx: AppContext,
  viewer: Viewer,
  filters: { page?: number } = {},
): Promise<Paged<AdminReviewItem>> {
  assertAdmin(viewer);
  const { page } = parseAdminInput(reviewListQuerySchema, filters);
  const { total } = await ctx.db
    .selectFrom("reviews")
    .select((eb) => eb.fn.countAll<number>().as("total"))
    .executeTakeFirstOrThrow();
  const window = pageWindow(page, Number(total));
  const rows = await ctx.db
    .selectFrom("reviews as rv")
    .innerJoin("bookings as b", "b.id", "rv.booking_id")
    .innerJoin("mechanic_profiles as mp", "mp.user_id", "rv.mechanic_id")
    .innerJoin("users as cu", "cu.id", "rv.customer_id")
    .select([
      "rv.id",
      "rv.booking_id",
      "b.request_id",
      "rv.rating",
      "rv.comment",
      "rv.is_demo_fixture",
      "rv.mechanic_id",
      "mp.display_name as mechanic_name",
      "rv.customer_id",
      "cu.display_name as customer_name",
      "rv.created_at",
    ])
    .orderBy("rv.created_at", "desc")
    .orderBy(sql`rv.rowid`, "desc")
    .limit(window.pageSize)
    .offset(window.offset)
    .execute();
  return toPaged(
    rows.map((row) => ({
      id: row.id,
      bookingId: row.booking_id,
      requestId: row.request_id,
      rating: row.rating,
      comment: row.comment,
      isDemoFixture: row.is_demo_fixture === 1,
      mechanic: { id: row.mechanic_id, displayName: row.mechanic_name },
      customer: { id: row.customer_id, displayName: row.customer_name },
      createdAt: row.created_at,
    })),
    window,
    Number(total),
  );
}
