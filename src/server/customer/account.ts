import "server-only";

import { sql } from "kysely";

import { BOOKING_STATUSES, type BookingStatus } from "@/lib/domain";
import { isAccountDeletionMessage } from "@/lib/validation/support";
import type { AppContext, Viewer } from "@/server/context";
import { unreadCount } from "@/server/notifications/queries";
import { listMySupportRequests, type SupportRequestSummary } from "@/server/support/requests";

import { assertCustomer } from "./access";
import { loadBookingSummaries, type CustomerBookingSummary } from "./booking-views";
import { loadRequestSummaries, type RequestSummary } from "./request-views";
import { requestTitle } from "./rows";

// The customer account dashboard (/account): counts computed from the customer's own data
// plus short lists linking to the detail pages. Nothing here is a fixed or estimated number.

export const ACCOUNT_LIST_LIMIT = 5;

export type QuoteDecisionItem = {
  requestId: string;
  title: string;
  /** The request's IANA time zone, for showing its times. */
  timeZone: string;
  liveQuoteCount: number;
  lowestLiveQuoteCents: number | null;
  /** When the request stops accepting quotes. */
  requestExpiresAt: string | null;
};

export type AccountInvoiceItem = {
  id: string;
  bookingId: string;
  invoiceNumber: string;
  title: string;
  timeZone: string;
  totalCents: number;
  currency: string;
  issuedAt: string;
  isDemoFixture: boolean;
};

export type PendingChangeOrderItem = {
  id: string;
  bookingId: string;
  bookingTitle: string;
  timeZone: string;
  description: string;
  amountCents: number;
  currency: string;
  createdAt: string;
  isDemoFixture: boolean;
};

export type GivenReviewItem = {
  id: string;
  bookingId: string;
  title: string;
  timeZone: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  isDemoFixture: boolean;
};

export type AccountOverview = {
  /** Requests waiting for quotes or with quotes to compare (effective status open/quoted). */
  openRequests: { count: number; items: RequestSummary[] };
  /** Live quotes across those requests, grouped by request. */
  quotesAwaitingDecision: { count: number; requests: QuoteDecisionItem[] };
  pendingReservations: { count: number; items: CustomerBookingSummary[] };
  /** Bookings past the reservation step (confirmed, in progress, completed, disputed), counted by status. */
  confirmedBookings: { count: number; countsByStatus: Record<BookingStatus, number>; items: CustomerBookingSummary[] };
  invoices: { count: number; items: AccountInvoiceItem[] };
  changeOrdersAwaitingApproval: { count: number; items: PendingChangeOrderItem[] };
  reviews: {
    givenCount: number;
    given: GivenReviewItem[];
    /** Completed bookings without a review yet. */
    awaitingReviewCount: number;
    awaitingReview: CustomerBookingSummary[];
  };
  supportRequests: { openCount: number; items: SupportRequestSummary[] };
  /** An open account deletion request sent from the account page (nothing is deleted automatically). */
  accountDeletion: { requestedAt: string; timeZone: string } | null;
  unreadNotificationCount: number;
  /** How many requests and bookings the customer has in total. */
  totals: { requests: number; bookings: number };
};

/** Booking states after a confirmed booking (only seeded fixtures reach them while payments are off). */
const CONFIRMED_BOOKING_STATUSES: readonly BookingStatus[] = ["confirmed", "in_progress", "completed", "disputed"];

function emptyStatusCounts(): Record<BookingStatus, number> {
  return Object.fromEntries(BOOKING_STATUSES.map((status) => [status, 0])) as Record<BookingStatus, number>;
}

/** Everything the customer account page shows, from the customer's own records only. */
export async function getAccountOverview(ctx: AppContext, viewer: Viewer): Promise<AccountOverview> {
  assertCustomer(viewer);
  const requests = await loadRequestSummaries(ctx, viewer);
  const bookings = await loadBookingSummaries(ctx, viewer);

  const open = requests.filter((request) => request.status === "open" || request.status === "quoted");
  const withQuotes = open.filter((request) => request.liveQuoteCount > 0);
  const pending = bookings.filter((booking) => booking.status === "pending_payment");
  const confirmed = bookings.filter((booking) => CONFIRMED_BOOKING_STATUSES.includes(booking.status));
  const countsByStatus = emptyStatusCounts();
  for (const booking of confirmed) countsByStatus[booking.status] += 1;
  const awaitingReview = bookings.filter((booking) => booking.canReview);

  const invoices = await ctx.db
    .selectFrom("invoices as i")
    .innerJoin("bookings as b", "b.id", "i.booking_id")
    .innerJoin("repair_requests as r", "r.id", "b.request_id")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .select([
      "i.id",
      "i.booking_id",
      "i.invoice_number",
      "i.total_cents",
      "i.currency",
      "i.issued_at",
      "i.is_demo_fixture",
      "r.time_zone",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
      "c.name as category_name",
    ])
    .where("b.customer_id", "=", viewer.id)
    .orderBy("i.issued_at", "desc")
    .execute();

  const changeOrders = await ctx.db
    .selectFrom("change_orders as o")
    .innerJoin("bookings as b", "b.id", "o.booking_id")
    .innerJoin("repair_requests as r", "r.id", "b.request_id")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .select([
      "o.id",
      "o.booking_id",
      "o.description",
      "o.amount_cents",
      "o.currency",
      "o.created_at",
      "o.is_demo_fixture",
      "r.time_zone",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
      "c.name as category_name",
    ])
    .where("b.customer_id", "=", viewer.id)
    .where("o.status", "=", "proposed")
    .where("b.status", "in", ["confirmed", "in_progress"])
    .orderBy("o.created_at")
    .execute();

  const reviews = await ctx.db
    .selectFrom("reviews as v")
    .innerJoin("bookings as b", "b.id", "v.booking_id")
    .innerJoin("repair_requests as r", "r.id", "b.request_id")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .select([
      "v.id",
      "v.booking_id",
      "v.rating",
      "v.comment",
      "v.created_at",
      "v.is_demo_fixture",
      "r.time_zone",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
      "c.name as category_name",
    ])
    .where("v.customer_id", "=", viewer.id)
    .orderBy("v.created_at", "desc")
    .orderBy(sql`v.rowid`, "desc")
    .execute();

  const support = await listMySupportRequests(ctx, viewer);
  const openSupport = support.filter((item) => item.status === "open");
  const deletion = openSupport.find((item) => isAccountDeletionMessage(item.topic, item.message));

  return {
    openRequests: { count: open.length, items: open.slice(0, ACCOUNT_LIST_LIMIT) },
    quotesAwaitingDecision: {
      count: withQuotes.reduce((sum, request) => sum + request.liveQuoteCount, 0),
      requests: withQuotes.slice(0, ACCOUNT_LIST_LIMIT).map((request) => ({
        requestId: request.id,
        title: request.title,
        timeZone: request.timeZone,
        liveQuoteCount: request.liveQuoteCount,
        lowestLiveQuoteCents: request.lowestLiveQuoteCents,
        requestExpiresAt: request.expiresAt,
      })),
    },
    pendingReservations: { count: pending.length, items: pending.slice(0, ACCOUNT_LIST_LIMIT) },
    confirmedBookings: { count: confirmed.length, countsByStatus, items: confirmed.slice(0, ACCOUNT_LIST_LIMIT) },
    invoices: {
      count: invoices.length,
      items: invoices.slice(0, ACCOUNT_LIST_LIMIT).map((row) => ({
        id: row.id,
        bookingId: row.booking_id,
        invoiceNumber: row.invoice_number,
        title: requestTitle(row.category_name, row.vehicle_year, row.vehicle_make, row.vehicle_model),
        timeZone: row.time_zone,
        totalCents: row.total_cents,
        currency: row.currency,
        issuedAt: row.issued_at,
        isDemoFixture: row.is_demo_fixture === 1,
      })),
    },
    changeOrdersAwaitingApproval: {
      count: changeOrders.length,
      items: changeOrders.slice(0, ACCOUNT_LIST_LIMIT).map((row) => ({
        id: row.id,
        bookingId: row.booking_id,
        bookingTitle: requestTitle(row.category_name, row.vehicle_year, row.vehicle_make, row.vehicle_model),
        timeZone: row.time_zone,
        description: row.description,
        amountCents: row.amount_cents,
        currency: row.currency,
        createdAt: row.created_at,
        isDemoFixture: row.is_demo_fixture === 1,
      })),
    },
    reviews: {
      givenCount: reviews.length,
      given: reviews.slice(0, ACCOUNT_LIST_LIMIT).map((row) => ({
        id: row.id,
        bookingId: row.booking_id,
        title: requestTitle(row.category_name, row.vehicle_year, row.vehicle_make, row.vehicle_model),
        timeZone: row.time_zone,
        rating: row.rating,
        comment: row.comment,
        createdAt: row.created_at,
        isDemoFixture: row.is_demo_fixture === 1,
      })),
      awaitingReviewCount: awaitingReview.length,
      awaitingReview: awaitingReview.slice(0, ACCOUNT_LIST_LIMIT),
    },
    supportRequests: { openCount: openSupport.length, items: support.slice(0, ACCOUNT_LIST_LIMIT) },
    accountDeletion: deletion ? { requestedAt: deletion.createdAt, timeZone: deletion.timeZone } : null,
    unreadNotificationCount: await unreadCount(ctx, viewer),
    totals: { requests: requests.length, bookings: bookings.length },
  };
}
