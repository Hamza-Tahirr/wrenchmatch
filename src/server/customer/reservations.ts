import "server-only";

import {
  BOOKING_CONSENTS,
  BOOKING_STATUSES,
  buildConsentSnapshot,
  CONSENT_VERSION,
  QUOTE_SERVICE_MODES,
  QUOTE_STATUSES,
  REQUEST_STATUSES,
  type BookingStatus,
  type ConsentItem,
  type QuoteStatus,
  type RequestStatus,
} from "@/lib/domain";
import { todayInZone, utcToZonedParts } from "@/lib/time";
import { cancelReservationSchema, selectQuoteSchema } from "@/lib/validation/booking";
import { fieldErrorsFromZod } from "@/lib/validation/request";
import { recordAudit } from "@/server/audit";
import type { AppContext, Viewer } from "@/server/context";
import { writeTx, type Tx } from "@/server/db/tx";
import { DomainError } from "@/server/errors";
import { expireStaleRecords } from "@/server/expiry";
import { newId } from "@/server/ids";
import { notify } from "@/server/notifications/notify";
import { getPaymentGateway } from "@/server/payments";
import {
  computeBookingMoney,
  computeQuoteTotals,
  QUOTE_ITEM_KINDS,
  sameQuoteTotals,
  type PricedItem,
  type QuoteTotals,
} from "@/server/pricing";

import { assertCustomer, notFound } from "./access";
import {
  loadBookingDetail,
  loadBookingSummaries,
  ONLINE_PAYMENTS_SOON_LABEL,
  type BookingMoneyView,
  type CustomerBookingDetail,
  type CustomerBookingSummary,
} from "./booking-views";
import { bookingIneligibility, MECHANIC_NOT_ELIGIBLE_MESSAGE } from "./eligibility";
import { invalidFields } from "./form-errors";
import { loadMechanicsForCustomer } from "./mechanic-public";
import {
  quoteDeclinedMechanicNotice,
  quoteReservedMechanicNotice,
  reservationCancelledMechanicNotice,
  reservationCreatedCustomerNotice,
  type QuoteFacts,
} from "./messages";
import { buildQuoteComparison, loadOwnRequestForQuotes, storedTotals, type QuoteComparisonItem } from "./quotes";
import { loadRequestSummaries, type RequestSummary } from "./request-views";
import { oneOf, vehicleLabel } from "./rows";
import { buildQuoteSnapshot } from "./snapshots";

// Reserving a quote (ARCHITECTURE section 5) and the customer's reservations. A reservation
// is a booking in pending_payment: with Stripe not connected it can only be cancelled, never
// confirmed (a database trigger enforces this too).

export type SelectQuoteParams = {
  quoteId: string;
  /** Keys of BOOKING_CONSENTS the customer ticked; all are required. */
  acceptedConsentKeys: readonly string[];
};

export type SelectQuoteResult = {
  bookingId: string;
  requestId: string;
  /** False when this call repeated an earlier selection of the same quote (double click). */
  created: boolean;
};

export type CancelReservationParams = { bookingId: string; reason?: string | null };
export type CancelReservationResult = { bookingId: string; requestId: string };

export type ReservationPreview = {
  request: RequestSummary;
  /** The request ZIP's centroid, for the service-area map (approximate, never the address). */
  requestArea: { lat: number; lng: number };
  quote: QuoteComparisonItem;
  /** What the reservation would record; the platform fee is included in the total. */
  money: BookingMoneyView;
  /** The statements to tick before reserving, with the version stored in the consent snapshot. */
  consents: { version: string; items: readonly ConsentItem[] };
  payment: { connected: boolean; label: string; description: string };
  /** Set when the customer already reserved this quote: go to the booking instead. */
  existingBookingId: string | null;
};

function requestClosedError(status: RequestStatus): DomainError {
  switch (status) {
    case "expired":
      return new DomainError("quote_expired", "This request has expired, so its quotes can no longer be reserved.");
    case "reserved":
    case "booked":
      return new DomainError("conflict", "You've already reserved a quote for this request.");
    case "cancelled":
      return new DomainError("conflict", "This request was cancelled, so its quotes can't be reserved.");
    default:
      return new DomainError("conflict", "This request isn't open for reservations.");
  }
}

function quoteClosedError(status: QuoteStatus): DomainError {
  switch (status) {
    case "expired":
      return new DomainError("quote_expired", "This quote has expired. Choose another quote or wait for new ones.");
    case "withdrawn":
      return new DomainError("conflict", "The mechanic withdrew this quote. Choose another quote.");
    case "selected":
      return new DomainError("conflict", "This quote has already been reserved.");
    default:
      return new DomainError("conflict", "This quote is no longer available. Choose another quote.");
  }
}

/** Totals recomputed from the saved items, or null when the items break the pricing rules. */
function recomputeTotals(items: readonly PricedItem[]): QuoteTotals | null {
  try {
    return computeQuoteTotals(items);
  } catch (error) {
    if (error instanceof DomainError) return null;
    throw error;
  }
}

async function loadQuoteForSelection(trx: Tx, quoteId: string) {
  return trx
    .selectFrom("quotes as q")
    .innerJoin("repair_requests as r", "r.id", "q.request_id")
    .innerJoin("service_categories as c", "c.id", "r.category_id")
    .innerJoin("zip_centroids as z", "z.zip", "r.zip")
    .select([
      "q.id",
      "q.request_id",
      "q.mechanic_id",
      "q.status",
      "q.service_mode",
      "q.parts_included",
      "q.currency",
      "q.labor_cents",
      "q.parts_cents",
      "q.tax_cents",
      "q.fee_cents",
      "q.total_cents",
      "q.slot_start_at",
      "q.slot_end_at",
      "q.estimated_duration_minutes",
      "q.scope",
      "q.exclusions",
      "q.notes",
      "q.expires_at",
      "q.withdrawn_at",
      "q.is_demo_fixture",
      "q.created_at",
      "r.customer_id",
      "r.status as request_status",
      "r.time_zone",
      "r.approx_lat",
      "r.approx_lng",
      "r.vehicle_year",
      "r.vehicle_make",
      "r.vehicle_model",
      "c.name as category_name",
      "z.city",
      "z.state",
    ])
    .where("q.id", "=", quoteId)
    .executeTakeFirst();
}

/**
 * Reserves one of the customer's quotes in a single BEGIN IMMEDIATE transaction: expire
 * stale records; check the request (own, open/quoted), the quote (submitted, unexpired)
 * and the mechanic (approved, accepting jobs, insured through the slot); recompute the
 * money from the saved quote items (pricing.ts) and check it equals the stored totals;
 * insert the pending_payment booking with its quote and consent snapshots; mark the quote
 * selected, other submitted quotes declined and the request reserved; notify everyone;
 * audit. UNIQUE(bookings.request_id / quote_id) stops a concurrent second reservation even
 * if these checks were bypassed.
 *
 * Repeating the same selection returns the existing booking (`created: false`).
 * Throws DomainError: invalid_input (consents), not_found, quote_expired,
 * mechanic_not_eligible, conflict (already reserved, withdrawn, prices inconsistent).
 */
export async function selectQuote(
  ctx: AppContext,
  viewer: Viewer,
  input: SelectQuoteParams,
): Promise<SelectQuoteResult> {
  assertCustomer(viewer);
  const parsed = selectQuoteSchema.safeParse(input);
  if (!parsed.success) throw invalidFields(fieldErrorsFromZod(parsed.error));
  const { quoteId } = parsed.data;

  return writeTx(ctx.db, async (trx) => {
    await expireStaleRecords(trx, ctx.now);
    const nowIso = ctx.now.toISOString();
    const quote = await loadQuoteForSelection(trx, quoteId);
    if (!quote || quote.customer_id !== viewer.id) throw notFound("quote");

    const existing = await trx
      .selectFrom("bookings")
      .select(["id", "quote_id", "status"])
      .where("request_id", "=", quote.request_id)
      .executeTakeFirst();
    if (existing) {
      // Cancelling a reservation also cancels its request (one booking per request).
      if (existing.status === "cancelled") {
        throw new DomainError(
          "conflict",
          "The reservation for this request was cancelled, so its quotes can't be reserved again. Send a new request instead.",
        );
      }
      if (existing.quote_id !== quote.id) {
        throw new DomainError("conflict", "You've already reserved another quote for this request.");
      }
      return { bookingId: existing.id, requestId: quote.request_id, created: false };
    }

    const requestStatus = oneOf(REQUEST_STATUSES, quote.request_status, "repair_requests.status");
    if (requestStatus !== "open" && requestStatus !== "quoted") throw requestClosedError(requestStatus);
    const quoteStatus = oneOf(QUOTE_STATUSES, quote.status, "quotes.status");
    if (quoteStatus !== "submitted") throw quoteClosedError(quoteStatus);
    if (quote.expires_at <= nowIso) throw quoteClosedError("expired");

    const point = { lat: quote.approx_lat, lng: quote.approx_lng };
    const mechanic = (await loadMechanicsForCustomer(trx, [quote.mechanic_id], point)).get(quote.mechanic_id);
    if (!mechanic) throw notFound("quote");
    const ineligible = bookingIneligibility(mechanic.bookingFacts, {
      todayLocal: todayInZone(ctx.now, quote.time_zone),
      slotDateLocal: utcToZonedParts(new Date(quote.slot_start_at), quote.time_zone).date,
    });
    if (ineligible) throw new DomainError("mechanic_not_eligible", MECHANIC_NOT_ELIGIBLE_MESSAGE, { reason: ineligible });

    const items = await trx
      .selectFrom("quote_items")
      .select(["kind", "description", "quantity", "unit_price_cents", "amount_cents"])
      .where("quote_id", "=", quote.id)
      .orderBy("sort_order")
      .orderBy("id")
      .execute();
    const pricedItems = items.map((item) => ({
      kind: oneOf(QUOTE_ITEM_KINDS, item.kind, "quote_items.kind"),
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      amountCents: item.amount_cents,
    }));
    const recomputed = recomputeTotals(pricedItems);
    if (!recomputed || !sameQuoteTotals(recomputed, storedTotals(quote))) {
      throw new DomainError(
        "conflict",
        "This quote's prices don't add up, so it can't be reserved. Choose another quote or ask us for help.",
      );
    }
    const money = computeBookingMoney(recomputed);
    const serviceMode = oneOf(QUOTE_SERVICE_MODES, quote.service_mode, "quotes.service_mode");

    const snapshot = buildQuoteSnapshot({
      computedAt: nowIso,
      quote: {
        id: quote.id,
        requestId: quote.request_id,
        mechanicId: quote.mechanic_id,
        serviceMode,
        partsIncluded: quote.parts_included === 1,
        currency: quote.currency,
        slotStartAt: quote.slot_start_at,
        slotEndAt: quote.slot_end_at,
        estimatedDurationMinutes: quote.estimated_duration_minutes,
        scope: quote.scope,
        exclusions: quote.exclusions,
        notes: quote.notes,
        quotedAt: quote.created_at,
        expiresAt: quote.expires_at,
      },
      items: pricedItems.map(({ kind, description, quantity, unitPriceCents, amountCents }) => ({
        kind,
        description,
        quantity,
        unitPriceCents,
        amountCents,
      })),
      mechanic: {
        id: mechanic.profile.id,
        displayName: mechanic.profile.displayName,
        yearsExperience: mechanic.profile.yearsExperience,
        certifications: mechanic.profile.certifications,
        areaLabel: mechanic.profile.areaLabel,
        services: mechanic.profile.services,
      },
      totals: money,
    });

    const bookingId = newId();
    await trx
      .insertInto("bookings")
      .values({
        id: bookingId,
        request_id: quote.request_id,
        quote_id: quote.id,
        customer_id: viewer.id,
        mechanic_id: quote.mechanic_id,
        status: "pending_payment",
        payment_state: "stripe_not_connected",
        payout_status: "not_eligible",
        service_mode: serviceMode,
        slot_start_at: quote.slot_start_at,
        slot_end_at: quote.slot_end_at,
        currency: quote.currency,
        labor_cents: money.laborCents,
        parts_cents: money.partsCents,
        tax_cents: money.taxCents,
        fee_cents: money.feeCents,
        total_cents: money.totalCents,
        platform_fee_bps: money.platformFeeBps,
        platform_fee_cents: money.platformFeeCents,
        mechanic_payout_cents: money.mechanicPayoutCents,
        quote_snapshot_json: JSON.stringify(snapshot),
        consent_snapshot_json: JSON.stringify(buildConsentSnapshot(BOOKING_CONSENTS, nowIso)),
        is_demo_fixture: 0,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .execute();
    await trx
      .updateTable("quotes")
      .set({ status: "selected", updated_at: nowIso })
      .where("id", "=", quote.id)
      .execute();
    const declined = await trx
      .updateTable("quotes")
      .set({ status: "declined", updated_at: nowIso })
      .where("request_id", "=", quote.request_id)
      .where("status", "=", "submitted")
      .returning(["id", "mechanic_id"])
      .execute();
    await trx
      .updateTable("repair_requests")
      .set({ status: "reserved", updated_at: nowIso })
      .where("id", "=", quote.request_id)
      .execute();

    const facts: QuoteFacts = {
      requestId: quote.request_id,
      categoryName: quote.category_name,
      vehicle: vehicleLabel(quote.vehicle_year, quote.vehicle_make, quote.vehicle_model),
      city: quote.city,
      state: quote.state,
      totalCents: money.totalCents,
      currency: quote.currency,
      slotStartAt: quote.slot_start_at,
      timeZone: quote.time_zone,
    };
    await notify(trx, { userId: quote.mechanic_id, ...quoteReservedMechanicNotice(facts), at: ctx.now });
    for (const other of declined) {
      await notify(trx, { userId: other.mechanic_id, ...quoteDeclinedMechanicNotice(facts), at: ctx.now });
    }
    await notify(trx, {
      userId: viewer.id,
      ...reservationCreatedCustomerNotice(bookingId, mechanic.profile.displayName, money.totalCents, quote.currency),
      at: ctx.now,
    });

    await recordAudit(trx, {
      actor: viewer,
      action: "quote.select",
      entityType: "quote",
      entityId: quote.id,
      metadata: {
        bookingId,
        requestId: quote.request_id,
        mechanicId: quote.mechanic_id,
        totalCents: money.totalCents,
        platformFeeCents: money.platformFeeCents,
        declinedQuoteIds: declined.map((row) => row.id),
        consentVersion: CONSENT_VERSION,
      },
      at: ctx.now,
    });
    return { bookingId, requestId: quote.request_id, created: true };
  });
}

function cannotCancelReservation(status: BookingStatus): DomainError {
  if (status === "cancelled") return new DomainError("conflict", "This reservation is already cancelled.");
  return new DomainError(
    "conflict",
    "Only a reservation that is still pending payment can be cancelled here. For a confirmed booking, open a help request.",
  );
}

/**
 * Cancels one of the customer's pending-payment reservations: the booking becomes
 * cancelled (with the reason), its quote declined and the request cancelled, which frees
 * the mechanic's slot. No money moved, so there is nothing to refund. Throws DomainError:
 * not_found, conflict (not pending payment), invalid_input.
 */
export async function cancelReservation(
  ctx: AppContext,
  viewer: Viewer,
  input: CancelReservationParams,
): Promise<CancelReservationResult> {
  assertCustomer(viewer);
  const parsed = cancelReservationSchema.safeParse(input);
  if (!parsed.success) throw invalidFields(fieldErrorsFromZod(parsed.error));
  const { bookingId, reason } = parsed.data;

  return writeTx(ctx.db, async (trx) => {
    const booking = await trx
      .selectFrom("bookings as b")
      .innerJoin("repair_requests as r", "r.id", "b.request_id")
      .innerJoin("service_categories as c", "c.id", "r.category_id")
      .innerJoin("zip_centroids as z", "z.zip", "r.zip")
      .select([
        "b.id",
        "b.request_id",
        "b.quote_id",
        "b.mechanic_id",
        "b.status",
        "b.total_cents",
        "b.currency",
        "b.slot_start_at",
        "r.time_zone",
        "r.vehicle_year",
        "r.vehicle_make",
        "r.vehicle_model",
        "c.name as category_name",
        "z.city",
        "z.state",
      ])
      .where("b.id", "=", bookingId)
      .where("b.customer_id", "=", viewer.id)
      .executeTakeFirst();
    if (!booking) throw notFound("booking");
    const status = oneOf(BOOKING_STATUSES, booking.status, "bookings.status");
    if (status !== "pending_payment") throw cannotCancelReservation(status);

    const nowIso = ctx.now.toISOString();
    await trx
      .updateTable("bookings")
      .set({ status: "cancelled", cancelled_at: nowIso, cancel_reason: reason, updated_at: nowIso })
      .where("id", "=", booking.id)
      .execute();
    await trx
      .updateTable("quotes")
      .set({ status: "declined", updated_at: nowIso })
      .where("id", "=", booking.quote_id)
      .where("status", "=", "selected")
      .execute();
    await trx
      .updateTable("repair_requests")
      .set({ status: "cancelled", updated_at: nowIso })
      .where("id", "=", booking.request_id)
      .where("status", "=", "reserved")
      .execute();

    const notice = reservationCancelledMechanicNotice({
      requestId: booking.request_id,
      categoryName: booking.category_name,
      vehicle: vehicleLabel(booking.vehicle_year, booking.vehicle_make, booking.vehicle_model),
      city: booking.city,
      state: booking.state,
      totalCents: booking.total_cents,
      currency: booking.currency,
      slotStartAt: booking.slot_start_at,
      timeZone: booking.time_zone,
    });
    await notify(trx, { userId: booking.mechanic_id, ...notice, at: ctx.now });
    await recordAudit(trx, {
      actor: viewer,
      action: "booking.cancel",
      entityType: "booking",
      entityId: booking.id,
      reason,
      metadata: { requestId: booking.request_id, quoteId: booking.quote_id, previousStatus: status },
      at: ctx.now,
    });
    return { bookingId: booking.id, requestId: booking.request_id };
  });
}

/** The customer's reservations and bookings, newest first. Payout state is never included. */
export async function listMyBookings(ctx: AppContext, viewer: Viewer): Promise<CustomerBookingSummary[]> {
  assertCustomer(viewer);
  return loadBookingSummaries(ctx, viewer);
}

/**
 * One of the customer's bookings: money from the booking's snapshot columns, line items
 * and terms from its quote snapshot, consent record, payment state ("Stripe not
 * connected" or demo fixture), mechanic contact only once confirmed, change orders,
 * invoice and review. Someone else's booking: not_found.
 */
export async function getMyBooking(ctx: AppContext, viewer: Viewer, bookingId: string): Promise<CustomerBookingDetail> {
  assertCustomer(viewer);
  return loadBookingDetail(ctx, viewer, bookingId);
}

/**
 * Everything the "review and reserve" step shows for one quote on the customer's own
 * request: the quote (with isSelectable / unavailableReason), the money the reservation
 * would record, the booking consents and the payment status. Someone else's quote: not_found.
 */
export async function getReservationPreview(
  ctx: AppContext,
  viewer: Viewer,
  quoteId: string,
): Promise<ReservationPreview> {
  assertCustomer(viewer);
  const owned = await ctx.db
    .selectFrom("quotes as q")
    .innerJoin("repair_requests as r", "r.id", "q.request_id")
    .select(["q.request_id"])
    .where("q.id", "=", quoteId)
    .where("r.customer_id", "=", viewer.id)
    .executeTakeFirst();
  if (!owned) throw notFound("quote");

  const { request, rows } = await loadOwnRequestForQuotes(ctx, viewer, owned.request_id);
  const quote = (await buildQuoteComparison(ctx, viewer, request, rows)).find((item) => item.id === quoteId);
  const [summary] = await loadRequestSummaries(ctx, viewer, { requestIds: [owned.request_id] });
  if (!quote || !summary) throw notFound("quote");

  const money = computeBookingMoney(quote.totals);
  const existing = await ctx.db
    .selectFrom("bookings")
    .select(["id"])
    .where("quote_id", "=", quoteId)
    .where("customer_id", "=", viewer.id)
    .where("status", "!=", "cancelled")
    .executeTakeFirst();
  const gateway = getPaymentGateway().getStatus();

  return {
    request: summary,
    requestArea: { lat: request.point.lat, lng: request.point.lng },
    quote,
    money: {
      currency: quote.currency,
      laborCents: money.laborCents,
      partsCents: money.partsCents,
      taxCents: money.taxCents,
      feeCents: money.feeCents,
      totalCents: money.totalCents,
      platformFeeBps: money.platformFeeBps,
      platformFeeCents: money.platformFeeCents,
    },
    consents: { version: CONSENT_VERSION, items: BOOKING_CONSENTS },
    payment: {
      connected: gateway.connected,
      label: ONLINE_PAYMENTS_SOON_LABEL,
      description:
        "You won't be charged now. No card details are collected: reserving creates a pending reservation, and checkout opens once online payments launch.",
    },
    existingBookingId: existing?.id ?? null,
  };
}
