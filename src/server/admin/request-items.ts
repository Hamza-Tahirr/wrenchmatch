import "server-only";

import { sql, type Kysely } from "kysely";

import {
  BOOKING_STATUSES,
  PREFERRED_WINDOWS,
  REQUEST_SERVICE_MODES,
  REQUEST_STATUS_INFO,
  REQUEST_STATUSES,
  type BookingStatus,
  type PreferredWindow,
  type RequestServiceMode,
  type RequestStatus,
} from "@/lib/domain";
import type { DB } from "@/server/db/schema.generated";

import { activeQuoteCountSql, effectiveRequestStatusSql } from "./effective-status";
import { oneOf, type PersonRef } from "./types";

// The request summary shared by the request list, the dashboard and the matching report.
// Only coarse request fields: contact details and the exact address stay in
// request_private until an admin reveals them (requests.ts).

export type AdminRequestListItem = {
  id: string;
  /** Status as of now: an open request past its expiry shows as "expired". */
  status: RequestStatus;
  categoryId: string;
  categoryName: string;
  /** e.g. "2016 Toyota Camry" */
  vehicle: string;
  /** Coarse area, e.g. "Tempe, AZ 85281". */
  areaLabel: string;
  zip: string;
  /** IANA zone of the request; format its timestamps and dates with it. */
  timeZone: string;
  serviceMode: RequestServiceMode;
  /** YYYY-MM-DD */
  preferredDate: string;
  preferredWindow: PreferredWindow;
  customer: PersonRef;
  /** Mechanics actually notified (0 is a real state that needs follow-up). */
  matchedCount: number;
  quotesCount: number;
  /** Quotes the customer can still select now. */
  activeQuotesCount: number;
  bookingStatus: BookingStatus | null;
  isDemoFixture: boolean;
  createdAt: string;
  submittedAt: string | null;
  expiresAt: string | null;
};

/** repair_requests (alias r) with its category (c), customer (cu) and booking (b); add where clauses. */
export function requestItemsFrom(db: Kysely<DB>) {
  return db
    .selectFrom("repair_requests as r")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .innerJoin("users as cu", "cu.id", "r.customer_id")
    .leftJoin("bookings as b", "b.request_id", "r.id");
}

export type RequestItemsFrom = ReturnType<typeof requestItemsFrom>;

/** Selects the columns of AdminRequestListItem (map rows with toRequestListItem). */
export function selectRequestItems(from: RequestItemsFrom, nowIso: string) {
  return from.select([
    "r.id",
    "r.status",
    "r.category_id",
    "c.name as category_name",
    "r.vehicle_year",
    "r.vehicle_make",
    "r.vehicle_model",
    "r.area_label",
    "r.zip",
    "r.time_zone",
    "r.service_mode",
    "r.preferred_date",
    "r.preferred_window",
    "r.customer_id",
    "cu.display_name as customer_name",
    "r.matched_count",
    "b.status as booking_status",
    "r.is_demo_fixture",
    "r.created_at",
    "r.submitted_at",
    "r.expires_at",
    effectiveRequestStatusSql("r", nowIso).as("effective_status"),
    sql<number>`(SELECT count(*) FROM quotes AS any_quote WHERE any_quote.request_id = r.id)`.as("quotes_count"),
    activeQuoteCountSql("r", nowIso).as("active_quotes_count"),
  ]);
}

type RequestItemRow = Awaited<ReturnType<ReturnType<typeof selectRequestItems>["execute"]>>[number];

export function vehicleLabel(year: number, make: string, model: string): string {
  return `${year} ${make} ${model}`;
}

export function toRequestListItem(row: RequestItemRow): AdminRequestListItem {
  return {
    id: row.id,
    status: oneOf(REQUEST_STATUSES, row.effective_status, "effective request status"),
    categoryId: row.category_id,
    categoryName: row.category_name,
    vehicle: vehicleLabel(row.vehicle_year, row.vehicle_make, row.vehicle_model),
    areaLabel: row.area_label,
    zip: row.zip,
    timeZone: row.time_zone,
    serviceMode: oneOf(REQUEST_SERVICE_MODES, row.service_mode, "repair_requests.service_mode"),
    preferredDate: row.preferred_date,
    preferredWindow: oneOf(PREFERRED_WINDOWS, row.preferred_window, "repair_requests.preferred_window"),
    customer: { id: row.customer_id, displayName: row.customer_name },
    matchedCount: row.matched_count,
    quotesCount: Number(row.quotes_count),
    activeQuotesCount: Number(row.active_quotes_count),
    bookingStatus: row.booking_status === null ? null : oneOf(BOOKING_STATUSES, row.booking_status, "bookings.status"),
    isDemoFixture: row.is_demo_fixture === 1,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Why matching can't be re-run for a request right now, or null when it can. The same rule
 * guards rerunMatching, so what the UI offers and what the command accepts agree.
 */
export function rerunBlockedReason(input: {
  status: RequestStatus;
  categoryName: string;
  categoryEnabled: boolean;
  zip: string;
  zipEnabled: boolean;
}): string | null {
  if (input.status !== "open" && input.status !== "quoted") {
    const label = REQUEST_STATUS_INFO[input.status].label.toLowerCase();
    return `Matching can only be re-run while a request is waiting for quotes. This one is ${label}.`;
  }
  if (!input.categoryEnabled) {
    return `${input.categoryName} is disabled in Settings, so no more mechanics are notified for it. Enable the category to re-run matching.`;
  }
  if (!input.zipEnabled) {
    return `ZIP ${input.zip} is not an enabled pilot ZIP, so no more mechanics are notified there. Enable it in Settings to re-run matching.`;
  }
  return null;
}
