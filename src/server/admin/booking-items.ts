import "server-only";

import type { Kysely } from "kysely";

import {
  BOOKING_STATUSES,
  PAYOUT_STATUSES,
  QUOTE_SERVICE_MODES,
  type BookingStatus,
  type PayoutStatus,
  type QuoteServiceMode,
} from "@/lib/domain";
import type { DB } from "@/server/db/schema.generated";

import { bookingInterventions, type BookingInterventions } from "./interventions";
import { vehicleLabel } from "./request-items";
import { oneOf, type PersonRef } from "./types";

// Bookings (pending-payment reservations and demo fixtures) as the admin sees them: money
// from the booking's immutable snapshot, both parties by display name only.

export const BOOKING_PAYMENT_STATES = ["stripe_not_connected", "demo_fixture_no_real_payment"] as const;
export type BookingPaymentState = (typeof BOOKING_PAYMENT_STATES)[number];

export type AdminBookingListItem = {
  id: string;
  requestId: string;
  quoteId: string;
  status: BookingStatus;
  /** "demo_fixture_no_real_payment" on demo fixtures; "stripe_not_connected" otherwise. */
  paymentState: BookingPaymentState;
  /** Anything but "not_eligible" exists only on demo fixtures. */
  payoutStatus: PayoutStatus;
  /** Show the DEMO badge. */
  isDemoFixture: boolean;
  /**
   * The booking's request is seeded sample data. A real reservation can be made on a demo
   * request (the seed does this), so show the DEMO badge on the request then too.
   */
  requestIsDemoFixture: boolean;
  customer: PersonRef;
  mechanic: PersonRef;
  categoryName: string;
  vehicle: string;
  areaLabel: string;
  /** The request's IANA zone; format the slot with it. */
  timeZone: string;
  serviceMode: QuoteServiceMode;
  slotStartAt: string;
  slotEndAt: string;
  currency: string;
  laborCents: number;
  partsCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
  platformFeeBps: number;
  platformFeeCents: number;
  mechanicPayoutCents: number;
  createdAt: string;
  confirmedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** Admin actions available now (demo fixtures only). */
  interventions: BookingInterventions;
};

/** bookings (b) with request (r), category (c), customer (cu) and mechanic profile (mp). */
export function bookingItemsFrom(db: Kysely<DB>) {
  return db
    .selectFrom("bookings as b")
    .innerJoin("repair_requests as r", "r.id", "b.request_id")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .innerJoin("users as cu", "cu.id", "b.customer_id")
    .innerJoin("mechanic_profiles as mp", "mp.user_id", "b.mechanic_id");
}

export type BookingItemsFrom = ReturnType<typeof bookingItemsFrom>;

export function selectBookingItems(from: BookingItemsFrom) {
  return from.select([
    "b.id",
    "b.request_id",
    "b.quote_id",
    "b.status",
    "b.payment_state",
    "b.payout_status",
    "b.is_demo_fixture",
    "r.is_demo_fixture as request_is_demo_fixture",
    "b.customer_id",
    "cu.display_name as customer_name",
    "b.mechanic_id",
    "mp.display_name as mechanic_name",
    "c.name as category_name",
    "r.vehicle_year",
    "r.vehicle_make",
    "r.vehicle_model",
    "r.area_label",
    "r.time_zone",
    "b.service_mode",
    "b.slot_start_at",
    "b.slot_end_at",
    "b.currency",
    "b.labor_cents",
    "b.parts_cents",
    "b.tax_cents",
    "b.fee_cents",
    "b.total_cents",
    "b.platform_fee_bps",
    "b.platform_fee_cents",
    "b.mechanic_payout_cents",
    "b.created_at",
    "b.confirmed_at",
    "b.started_at",
    "b.completed_at",
    "b.cancelled_at",
    "b.cancel_reason",
  ]);
}

type BookingItemRow = Awaited<ReturnType<ReturnType<typeof selectBookingItems>["execute"]>>[number];

export function toBookingListItem(row: BookingItemRow): AdminBookingListItem {
  const status = oneOf(BOOKING_STATUSES, row.status, "bookings.status");
  const payoutStatus = oneOf(PAYOUT_STATUSES, row.payout_status, "bookings.payout_status");
  const isDemoFixture = row.is_demo_fixture === 1;
  return {
    id: row.id,
    requestId: row.request_id,
    quoteId: row.quote_id,
    status,
    paymentState: oneOf(BOOKING_PAYMENT_STATES, row.payment_state, "bookings.payment_state"),
    payoutStatus,
    isDemoFixture,
    requestIsDemoFixture: row.request_is_demo_fixture === 1,
    customer: { id: row.customer_id, displayName: row.customer_name },
    mechanic: { id: row.mechanic_id, displayName: row.mechanic_name },
    categoryName: row.category_name,
    vehicle: vehicleLabel(row.vehicle_year, row.vehicle_make, row.vehicle_model),
    areaLabel: row.area_label,
    timeZone: row.time_zone,
    serviceMode: oneOf(QUOTE_SERVICE_MODES, row.service_mode, "bookings.service_mode"),
    slotStartAt: row.slot_start_at,
    slotEndAt: row.slot_end_at,
    currency: row.currency,
    laborCents: row.labor_cents,
    partsCents: row.parts_cents,
    taxCents: row.tax_cents,
    feeCents: row.fee_cents,
    totalCents: row.total_cents,
    platformFeeBps: row.platform_fee_bps,
    platformFeeCents: row.platform_fee_cents,
    mechanicPayoutCents: row.mechanic_payout_cents,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    interventions: bookingInterventions(isDemoFixture, status, payoutStatus),
  };
}
